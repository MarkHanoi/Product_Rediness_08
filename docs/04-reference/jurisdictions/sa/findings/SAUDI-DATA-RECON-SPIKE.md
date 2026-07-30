# Saudi Arabia — DATA-ACQUISITION RECON SPIKE (OSINT + GIS due-diligence)

**2026-07-24 · research SPIKE, live-probed from outside SA · extends L-606.** This file is the
due-diligence record: every acquisition path chased, each probed live where possible, each classified
**reachable / authenticated / geo-fenced / licensed / absent** with the evidence (URL · HTTP status ·
Content-Type · body characterisation). Asserted on **content-type + body shape, not HTTP 200** — a WAF
returns 200 apology pages, so a 200 is not a success. **This spike found NO new source that publishes
dimensional building rules and is reachable from here** — but it materially reframes *where the
authoritative rule sources sit* (open-data-catalogued, not lawyer-gated), which raises the *compileable*
ceiling under the green/amber/red model even though the *live-reachable-from-here* ceiling is unchanged.

> **Honesty contract (§CONTEXT-DATA-HONESTY, C58 §1.2/§1.4):** "exists but inaccessible" ≠ "does not
> exist". Failure and empty are the SAME VALUE unless separated by evidence. Where a *guessed* hostname
> did not resolve, that is recorded as **"guessed host — no evidence either way"**, never as "absent".
> No WAF was bypassed, no proxy/VPN used, no geo-restriction evaded.

---

## 0 — The three-state reframe applied (founder-approved, 2026-07-24)

RATE = "can PRYZM **answer** a parcel automatically?" not "is it in a live database?". Every source
below is scored against three states, and this is the axis that matters for the ceiling:

- **GREEN** — government publishes the numbers as queryable data → automatic, today.
- **AMBER** — government publishes the **law or the plan** (PDF / open-data table / GIS layer); PRYZM
  compiles it **once** into a verified, cited rule pack → answers at runtime with no human, no PDF read.
  A PDF or an open-data dataset behind a portal is **AMBER, not a blocker** — the cost is one-time
  structuring, bounded by *institutional coverage*, not by parsing.
- **RED** — only a human lawyer can interpret per parcel → the true blocker.

**The spike's central reframe finding:** the two levers that L-606 filed as hard geo-fenced blockers —
the *exact per-zone vertical value* and *parcel geometry* — have their **authoritative sources published
as OPEN-DATA datasets** ("Approved Local, Guideline & Detailed Plans" = المخطط المعتمد; "Approved Land
Subdivision Plans") on the SDAIA national open-data portal, catalogued via Balady's open-data page. Open
data is **AMBER (compile-once), not RED (lawyer-only), and not the licensed GEOSA gate.** From *this*
environment the SDAIA portal host is network-blocked, so nothing was pulled — but the classification of
the lever moves from "needs a MOMRAH/Balady **data agreement**" toward "needs the **public open-data
portal** reached and its plan-layer digitised." That is a categorically cheaper unlock, and it is the
headline of this spike.

---

## 1 — Source inventory (every path chased)

| # | Path | Host(s) probed |
|---|---|---|
| 1 | SDAIA National Open Data Portal | `open.data.gov.sa`, `od.data.gov.sa`, `data.gov.sa` |
| 2 | Balady open-data page + gateway API | `balady.gov.sa/en/open-data`, `apiservices.balady.gov.sa` (Apigee) |
| 3 | Balady U-Maps parcel backend (established) | `umapsudp.momrah.gov.sa`, `umaps.balady.gov.sa` |
| 4 | GEOSA National Geoportal + catalog | `geoportal.sa`, `geoportal.geosa.gov.sa`, `geocatalog.geoportal.sa` (GeoNetwork), `gds/apps/ksacors.geoportal.sa` |
| 5 | National Portal GIS/open-data pages | `my.gov.sa/en/content/gis`, `/open-data` |
| 6 | RCRC Open Data Portal (dev-authority) | `opendata.rcrc.gov.sa` (Opendatasoft) |
| 7 | Riyadh Amana "Wasef" spatial portal | `mapservice.alriyadh.gov.sa`, `maps.alriyadh.gov.sa`, `alriyadh.gov.sa` |
| 8 | Other Amanas (Jeddah/Eastern/Makkah) | guessed hosts — see matrix |
| 9 | Dev authorities (NEOM/ROSHN/Diriyah/Qiddiya) | guessed hosts — see matrix |
| 10 | ArcGIS Hub public index | `hub.arcgis.com` |

---

## 2 — REACHABILITY MATRIX (evidence-first)

Legend: **REACHABLE** = anonymous, real content of the expected shape · **REACHABLE (wrong content)**
= reachable + real JSON, but not planning/dimensional data · **LICENSED** = reachable but gated behind a
publishing/licence policy · **GEO-FENCED** = measured block on shape (NXDOMAIN / WAF-200 / Cloudflare-403
/ ECONNREFUSED / timeout) · **ABSENT (guessed)** = a *guessed* host that did not resolve — no evidence.

| Source | State | HTTP / CT | Body evidence |
|---|---|---|---|
| **`apiservices.balady.gov.sa/v1/momrah-services/open-data`** | **REACHABLE (wrong content)** | 200 · `application/json` · 273 KB | Real Drupal JSON — but the rows are `type:"news"` **press releases** (MOMRAH newsroom), NOT datasets. Reachable Apigee gateway; wrong feed. `/…/datasets`, `/…/parcels`, `/…/subdivision-plans` → 200 JSON `{"code":404,"Not Found"}`. Root `/` → `messaging.adaptors.http.flow.ApplicationNotFound` (Apigee). |
| **`opendata.rcrc.gov.sa`** (Royal Commission for Riyadh City) | **REACHABLE** | 200 · `application/json` · 508 KB catalog | Opendatasoft, **35 datasets**, fully queryable; GeoJSON export verified live (`/exports/geojson` → real metro-line coordinates). **BUT content = statistical / transport / demographic** (population, households, metro, bus, traffic, commercial/entertainment service points). **Zero dimensional-rule datasets** — keyword scan: only "building-**material**" (census) + "dependency-**ratio**" (demographics). No height/FAR/setback/zoning/parcel-rule layer. |
| **`geocatalog.geoportal.sa/geonetwork`** (GEOSA catalog) | **REACHABLE → LICENSED (empty to public)** | CSW GetCapabilities 200 · `application/xml` · 13.8 KB; GN4 `_search` 200 · JSON | CSW `GetRecords` → `numberOfRecordsMatched="0"`. GN4 Elasticsearch `_search` → 15 hits, **all template/test records** ("Deegree22 WFS Fragments Philosopher Database Test Template", "Template for feature catalogue"). **No real national dataset is published to anonymous** — confirms "licensed, not open" at the catalog layer. |
| **`geoportal.geosa.gov.sa/geoportal/`** (GEOSA app) | **REACHABLE (app shell only)** | 200 · `text/html` · 767 B | React SPA shell ("National Geospatial Platform"). `/geoportal/rest/services` → returns the SPA shell (client routing, no REST dir). `/server/rest/services` → IIS **404**. No anonymous ArcGIS REST directory at guessed paths. |
| `balady.gov.sa/en/open-data` | **REACHABLE (catalogue page)** | 200 · `text/html` · 191 KB | Real page listing **42 datasets** incl. **"Approved Local, Guideline & Detailed Plans"** (= المخطط المعتمد, the vertical-value source), **"Approved Land Subdivision Plans"** (parcel geometry), "Street Naming & Numbered Properties", "Construction Permits". **Downloads route to `open.data.gov.sa/en/publishers/aec020ce-…` (SDAIA) — unreachable from here (row below).** |
| **`open.data.gov.sa` / `od.data.gov.sa` / `data.gov.sa`** (SDAIA portal — **the key catalogue**) | **GEO-FENCED (network)** | `curl` → timeout (HTTP 000, 20 s); `WebFetch` → **ECONNREFUSED 78.93.109.61:443** | The portal that actually *holds* the "Approved Plans" + "Subdivision Plans" + land-use datasets. Host refuses/times out from this environment at the network layer. This is a **public open-data portal (AMBER), not a licensed gate** — reachable in-region or via a different egress. Measured negative on shape (connection refused), not proof of absence. |
| **`umapsudp.momrah.gov.sa`** (Balady MapServer/28 — resolved per-parcel setbacks/floors) | **GEO-FENCED (re-confirmed)** | `server/rest/services?f=json` → **NXDOMAIN** (`Could not resolve host`) | Re-confirmed this pass. The ArcGIS host is not in public DNS while `balady.gov.sa`/`momrah.gov.sa` resolve — split-horizon. The proxy (`umaps.balady.gov.sa/newProxyUDP/proxy.ashx`) returns a WAF-200 Arabic apology page (L-606 / SAUDI-UMAPS-API-ENUMERATION). **Not bypassed.** |
| `geoportal.sa` | **GEO-FENCED (WAF)** | 200 · `text/html` · 246 B | `<title>Request Rejected</title> … Your support ID is: 7312101248312869665`. WAF rejection body behind a 200. |
| `my.gov.sa/en/content/open-data` (+ `/gis`) | **GEO-FENCED (Cloudflare)** | 403 · `text/html` | `Attention Required! | Cloudflare` challenge page. |
| `mapservice.alriyadh.gov.sa/geoportal/geomap` (Wasef) | **REACHABLE (app) → backend not anon** | 200 · `text/html` · 13 KB; `maps.alriyadh.gov.sa` → **timeout** | Riyadh region spatial portal, MapLibre vector-tile Angular app; meta advertises "المخططات وقطع الاراضي / الشوارع" (plans & parcels / streets). `main.js` (12 MB) references `app.alriyadh.gov.sa`, mapbox/arcgis basemaps; **no anonymous parcel REST enumerable**; parcel upstream = the gated MOMRAH backend. `/arcgis/rest`, `/server/rest` → IIS 404. |
| `gis.jeddah.gov.sa`, `eamana.gov.sa`, `www.alamanah.gov.sa` (Makkah) | **ABSENT (guessed hosts)** | NXDOMAIN / timeout | Guessed hostnames did not resolve — **no evidence the Amanas lack GIS**; the real hostnames were not found this pass. `www.jeddah.gov.sa` → timeout. |
| `gis.neom.com`, `opendata.neom.com`, `data.diriyah.sa`, `gis.roshn.sa`, `opendata.qiddiya.com` | **ABSENT (guessed hosts)** | NXDOMAIN | Guessed dev-authority hosts did not resolve. NEOM is known to run an enterprise ArcGIS portal (search result) but `gis.neom.com` NXDOMAIN'd from here and such portals are auth-gated regardless. No evidence either way on the real hosts. |
| `hub.arcgis.com` public index | **REACHABLE (empty for SA)** | 200 · `application/geo+json` | `?q=Riyadh land use` → `numberMatched:0`. No Saudi planning datasets on the public ArcGIS Hub index. |

---

## 3 — The planning data model (parcel → envelope), and where each field's source sits

```
parcel (geometry, area)                          ← Balady MapServer/28 [GEO-FENCED]
   │                                                or "Approved Land Subdivision Plans" open dataset [SDAIA, GEO-FENCED here / AMBER]
   ▼
planning-area / zone  (المخطط المعتمد)            ← "Approved Local/Guideline/Detailed Plans" open dataset [SDAIA, GEO-FENCED here / AMBER]
   │                                                + dev-authority regime (RCRC/ROSHN/NEOM…) [PDF, AMBER / some geo-fenced]
   ▼
classification (villa/apt/comm/admin)            ← national 4-class taxonomy, 2024 MOMRAH decision §3-1..§3-4 [AMBER, compiled]
   │                                                per-parcel MAINLANDUSE ← Balady/28 [GEO-FENCED]
   ▼
dimensional regime
   ├─ ground coverage (نسبة البناء)               ← 2024 MOMRAH §4-1/§4-2 cl.1 — exact national constant [AMBER→compiled]
   ├─ setbacks (الارتدادات) = max(w/5,{3,2,2})     ← 2024 MOMRAH §4-1/§4-2 cl.4 — exact national formula [AMBER→compiled]
   │      needs one input: street width           ← Balady/28 or Wasef streets [GEO-FENCED] / user-drawn / OSM
   ├─ max height / floors (EXACT value)           ← municipal approved plan §4 cl.1 [AMBER via open "Approved Plans" dataset]
   │      national CEILING (villa 14 m / apt 23 m) — ⚠ DISPUTED (see §7), held null, refuses
   └─ FAR (معامل البناء)                          ← does not exist in residential regime — definitive national absence
   ▼
buildable envelope = plot ⊖ setbacks, capped by coverage×area, extruded to (municipal) height
```

**The whole story in one line:** every field's *rule* is national and compileable (AMBER); every field's
*per-parcel input* (geometry, class, width, exact floors) lives behind the same Balady geo-fence **or** in
the SDAIA open-data catalogue that is network-blocked from here but is **open, not licensed**.

---

## 4 — Rule-provenance matrix (each field → its authoritative source + state)

| Field | Authoritative source | Green/Amber/Red | Reachable from here? | Evidence |
|---|---|---|---|---|
| Ground coverage | 2024 MOMRAH decision §4-1/§4-2 cl.1 | **AMBER → compiled** | ✅ (PDF read live L-606, 2 gov hosts) | villa 0.75 / apt 0.65, exact constant |
| Front/side/rear setback | 2024 MOMRAH §4-1/§4-2 cl.4 | **AMBER → compiled** | ✅ (PDF read live) | `max(w/5,{3,2,2})` closed-form |
| Classification taxonomy | 2024 MOMRAH §3-1..§3-4 | **AMBER → compiled** | ✅ | 4-class national taxonomy |
| Per-parcel class (`MAINLANDUSE`) | Balady MapServer/28 | AMBER (data agreement) / demo=user-pick | ❌ geo-fenced | NXDOMAIN host |
| Parcel geometry + street width | Balady/28 **or** "Approved Land Subdivision Plans" (SDAIA open) | **AMBER** (open dataset) / demo=user-drawn | ❌ SDAIA net-blocked; Balady geo-fenced | timeout / NXDOMAIN |
| Exact height / floors (per zone) | "Approved Local/Guideline/Detailed Plans" (SDAIA open) + dev-authority regs | **AMBER** (open dataset) — reframed from RED | ❌ SDAIA net-blocked | catalogued on Balady open-data page; download host blocked |
| National height CEILING | 2024 MOMRAH §5-1-5 / §3-2 | ⚠ **DISPUTED** (§7) | held null | do NOT assert 14 m / 23 m as fact |
| FAR | — | **absence (definitive)** | ✅ (0 hits) | excluded from denominator |

---

## 5 — Per-source RATE contribution (honest, quantified)

Scored against the standard denominator (zone/use + a density metric + height, per parcel, without
reading an ordinance). Two columns: what the source adds **live-from-here** vs. what it adds to the
**compileable (AMBER) ceiling**.

| Source | Live-from-here contribution | Compileable (AMBER) contribution |
|---|---|---|
| 2024 MOMRAH decision (footprint) | **already fully credited** in the ~55% | the 66.7% footprint half — AMBER, one-time compile, kingdom-wide |
| SDAIA "Approved Plans" open dataset | **0 (host net-blocked here)** | **the biggest reframe** — moves exact vertical value from RED→AMBER; if reached + digitised, +~7–10 pts toward the vertical half |
| SDAIA "Subdivision Plans" open dataset | 0 (blocked here) | AMBER parcel-geometry source *independent of the Balady data agreement* |
| Balady MapServer/28 | 0 (geo-fenced) | +~15 pts if an agreement/egress lands (resolved setbacks + class + floors per parcel) |
| RCRC Open Data (opendata.rcrc.gov.sa) | **context only** — reachable transport/demographic layers | **0** to the dimensional rate (no rule datasets) |
| GEOSA GeoNetwork / Geoportal | 0 (licensed / empty to public) | 0 until a licence (national LoD2 / terrain — a *context* axis) |
| Global fallbacks (Copernicus DEM, MS/Google footprints, OSM) | context axis (buildings + terrain + roads) | unchanged |

**Revised ceiling under the reframe:**

- **Live-reachable-from-here ceiling: ~55% (unchanged).** This spike reached no new source that serves
  dimensional rules; the footprint is already credited, and the two levers above it were not pulled from
  this environment (SDAIA net-blocked, Balady geo-fenced, GEOSA licensed, RCRC has no rules).
- **Compileable / institutional-coverage ceiling: ~72–80% (raised, conditional).** Because the exact
  per-zone vertical source is now shown to be **open-data-catalogued (AMBER)** rather than lawyer-gated
  (RED), the one-time-compile ceiling is higher than L-606's "72% only with a data agreement": part of
  that 72% is reachable via a **public open portal** (cheaper than an agreement), and the residual gap to
  Denmark's 96% is the genuinely-per-municipality vertical fragmentation + the licensed GEOSA context
  products. **This is conditional on reaching the SDAIA portal and digitising the plan layer — neither
  done here — so it is an evidence-bounded revision, not a claimed gain.**

---

## 6 — Acquisition paths RANKED by impact × feasibility

| Rank | Path | Impact | Feasibility | Why |
|---|---|---|---|---|
| **1** | **Reach the SDAIA open-data portal** (`open.data.gov.sa`) from an unblocked egress; pull "Approved Local/Guideline/Detailed Plans" + "Approved Land Subdivision Plans" | **Highest** — the exact-vertical source (AMBER) + an agreement-free parcel-geometry source, in one portal | **Medium** — it is a *public open-data portal*, not a licensed gate; blocker here is network egress, not permission. Confirm the licence terms per dataset. | Reframes the dominant blocker from RED/agreement to AMBER/open. |
| **2** | **Balady `MapServer/28`** via in-SA egress or MOMRAH/Balady agreement | High — resolved setbacks + class + floors + geometry per parcel (a *read* envelope, better than Barcelona) | Low–Medium — geo-fenced (NXDOMAIN), likely needs an agreement | The richest single upstream; still the gold path if the portal route underdelivers. |
| **3** | **Compile + human-verify the footprint pack** (Phase 1) | Realises the credited ~55% as a certified `structured` product | **High** — pack authored (L-606); only the `VERIFICATION.md` human sign-off remains | Ship the win we already own. |
| **4** | **Digitise dev-authority regimes** (RCRC/ROSHN/NEOM/Diriyah/Qiddiya design codes) into AMBER rule packs | Medium — the §1 cl.3 override surface (the R1 trap) | Medium — PDFs (AMBER), some hosts geo-fenced; find the real hostnames | Overrides the national default in giga-project zones; compile-once. |
| **5** | **GEOSA National Geoportal licence** | Context axis (national LoD2 buildings + terrain), not the dimensional rate | Low — licensed process | Separate axis; global fallbacks cover the interim. |
| **6** | **Wire RCRC + global context layers** (transport/demographics from RCRC ODS; Copernicus DEM; MS/Google footprints; OSM) | Context enrichment | **High** — RCRC ODS + globals all reachable now | Free breadth; no dimensional-rate movement. |

---

## 7 — Height caps stay DISPUTED (do not regress)

Per `sources/VERIFICATION.md` (2026-07-24 independent pass): villa ≤14 m (§5-1-5 cl.3) is **NOT
confirmable** from the committed extract, and apartment ≤23 m (§3-2) is **DISPUTED** — read there as a
*classification boundary* (apartment vs high-rise), not a certified national regulatory cap. This spike
did **not** re-read Chapter 5 of the full PDF and makes **no new claim** on the caps. The pack ships
`maxHeight_m`/`maxFloors` = `null` (they refuse), so no fabricated number reaches the screen. **Do not
re-assert 14 m / 23 m as fact until the Chapter-5 re-read is done.**

---

## 8 — Missed opportunities / open leads (for the next in-region pass)

1. **SDAIA portal per-dataset licence + schema** — from an unblocked egress, read the "Approved Plans"
   dataset's fields: does it carry per-zone `maxHeight`/`maxFloors`/`FAR`, or only plan boundaries? This
   is the single question that decides whether the vertical value is truly AMBER-compileable.
2. **Real Amana hostnames** — the guessed Jeddah/Eastern/Makkah/Madinah GIS hosts NXDOMAIN'd; the actual
   spatial-portal hostnames (Riyadh's is `mapservice.alriyadh.gov.sa`) were not enumerated for the others.
3. **Wasef backend** — `mapservice.alriyadh.gov.sa` main.js (12 MB) hides the tile/parcel API host in an
   Angular environment config; a fuller parse may surface an anonymous vector-tile parcel layer.
4. **Apigee catalogue** — `apiservices.balady.gov.sa` is a live Apigee gateway; only the `open-data`
   (newsroom) basepath was found. Other MOMRAH service basepaths may proxy the parcel/plan data.
5. **GEOSA authenticated catalog** — the GeoNetwork index is populated but publishes only templates to
   anonymous; a licence/login would reveal the real national metadata + WMS/WFS links.
6. **`geocatalog.geoportal.sa` sub-hosts** (`gds`, `apps`, `ksacors`, `surveys`) reachable — geodesy /
   CORS / survey tools, not planning rules, but confirm GEOSA sub-infrastructure is anonymously up.

---

**Cross-refs:** [`SAUDI-MASTER-DATA-SOURCE-STUDY.md`](./SAUDI-MASTER-DATA-SOURCE-STUDY.md) ·
[`../SAUDI-UMAPS-API-ENUMERATION.md`](../SAUDI-UMAPS-API-ENUMERATION.md) ·
[`../SAUDI-PRIMARY-DECISION-EXTRACT.md`](../SAUDI-PRIMARY-DECISION-EXTRACT.md) ·
[`../LEGISLATION-RATE.md`](../LEGISLATION-RATE.md) · [`../RATE-IMPLEMENTATION-PLAN.md`](../RATE-IMPLEMENTATION-PLAN.md) ·
[`../sources/VERIFICATION.md`](../sources/VERIFICATION.md) (height caps DISPUTED) ·
[`../sa-01/ruh-riyadh/findings/L-606-RIYADH-DEMO-PACK-AND-PROBES.md`](../sa-01/ruh-riyadh/findings/L-606-RIYADH-DEMO-PACK-AND-PROBES.md).
Live probes recorded 2026-07-24 from outside SA; every geo-fence asserted on shape, not HTTP status.
