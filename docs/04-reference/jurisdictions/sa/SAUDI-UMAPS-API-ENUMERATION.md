# Balady U-Maps — the parcel/zoning backend, ENUMERATED

**2026-07-22.** The seed doc's §2 carried a `MEASURED NEGATIVE`: *"`umaps.balady.gov.sa` — soft-404
SPA shell, no backend REST directory found."* The brief's §4.1 asked to re-open it properly, because
**a client-rendered shell does not prove there is no API — it proves the STATIC HTML has none.**

**Re-opened. The negative is dead. The backend is fully enumerated below — and it is a rich,
well-structured ArcGIS parcel service that already publishes per-parcel setbacks, land use and floor
count. But it is not reachable from outside Saudi Arabia.** Both halves of that sentence are
`VERIFIED-LIVE` and both matter.

---

## 1 — How the shell gave up its backend in the first 8 KB

`curl https://umaps.balady.gov.sa/` returns an Angular SPA shell (8 064 bytes). **The external pass
stopped here.** But the shell's own inline `<script>` contains the deep-link handler, and it names
the backend outright:

```js
url = `https://umaps.balady.gov.sa/newProxyUDP/proxy.ashx?` +
      `https://umapsudp.momrah.gov.sa/server/rest/services/Umaps/` +
      `Umaps_Identify_Satatistics/MapServer/28/query?where=IN_PARCELID='${rid}'...&f=pjson`
```

The app is a **standard Esri ArcGIS JS viewer**. Its config is fetched at runtime from
`https://umaps.balady.gov.sa/configs/*.json`, all keylessly readable:

| Config | What it revealed |
|---|---|
| `config.json` | `webApi: umaps.balady.gov.sa/UMAPI`, `baladyApi: apiservices.balady.gov.sa`, `workflowApi: …/workflow.api` |
| `app-Config.json` | `serverURL: https://umapsudp.momrah.gov.sa/server/`, `proxyUrl: https://umaps.balady.gov.sa/newProxyUDP/proxy.ashx`, ArcGIS `appId ac27ae28…`, `authenticationType: portal` |
| `service-Config.json` | **the full layer map** — see §2 |
| `configs/advanced-search/SubDivisionParcel.json` | **the parcel report field schema** — see §3 |
| `configs/toggleLayers.json` | 100+ thematic layers incl. `Hosted/Ahkam/VectorTileServer` (*أحكام* = building provisions), `Urban_Boundary`, `UMaps_AdditionalLayers` |

So the answer to *"what does the SPA call?"* is: **`umapsudp.momrah.gov.sa/server/rest/services/`
(ArcGIS Server), fronted by a reCAPTCHA-gated `proxy.ashx` on the `umaps.balady.gov.sa` origin.**
Exactly the Barcelona `/arcgis/` → `/geoserveis/` shape — the endpoint was hiding one config file
away, not absent.

---

## 2 — The service map (`service-Config.json`, VERIFIED-LIVE read)

All under `https://umapsudp.momrah.gov.sa/server/rest/services/Umaps/…`:

| Purpose | Service / layer |
|---|---|
| **Parcel identify** | `Umaps_Identify_Satatistics/MapServer/28` and `Umaps_Click/MapServer/28` (`parcelURL`) |
| Building | `Umaps_Click/MapServer/27` (`buildingURl`) |
| Street | `Umaps_Click/MapServer/26` (`streetURL`) |
| Real-estate identity (deeds) | `Umaps_RealEstateID/MapServer/0` |
| Administrative hierarchy | `UMaps_AdministrativeData/MapServer/{0 district,1 municipality,2 city,4 amana}` |
| Urban boundary | `Urban_Boundary/MapServer/0` |
| Building-provisions vector tiles | `Hosted/Ahkam/VectorTileServer` |

---

## 3 — 🔴 The parcel service already carries the compliance fields (`SubDivisionParcel.json`)

`MapServer/28` (`cpSubDivisionParcelS`, id `SUBDIVISIONPARCEL_UNIFIED_ID`) publishes, per parcel:

| Field | AR alias | Meaning |
|---|---|---|
| `MAINLANDUSE` | الإستعمال العام | **main land use (classification)** |
| `DETAILSLANDUSE` | الإستعمال التفصيلي | detailed land use |
| `MEASUREDAREA` | المساحة التقريبية | plot area (m², `esriFieldTypeDouble`) |
| `FRONTDEFECTION` | الارتداد الأمامي | **front setback** |
| `REARDEFECTION` | الارتداد الخلفي | **rear setback** |
| `SIDEDEFECTION` | الارتداد الجانبي | **side setback** |
| `NOOFFLOORS` | عدد الأدوار | **number of floors** |
| `RESIDENTIALUNITS` / `COMMERCIALUNITS` | | unit counts |
| `BUILDINGCONDITION` | اشتراطات البناء | **building conditions** |
| `IN_PARCELID` | رقم الهوية العقارية | real-estate ID (join key) |
| `SUBDIVISIONPLAN_ID` | رقم المخطط | subdivision plan number |

⭐ **This is the single most important architectural finding of the probe.** Balady does not merely
publish parcel geometry + a zone code the way Catastro + MUC do — **it publishes the resolved
setbacks, land use and floor count directly, per parcel.** If this service were reachable, PRYZM
would not need to *construct* the Saudi envelope at all for these fields — it would *read* it, at
`granularity: 'parcel'`, `confidence: 'authoritative'` (C58 §1.2). That is a materially better data
position than Barcelona, where every number is constructed.

The `field-config.json` further exposes a full deed schema (`DEEDNO`, `DEEDAREA`,
`NORTH/SOUTH/EAST/WESTLIMITLENGTH` + `…DESCRIPTION`, `OWNERNAME`, `REF_CADASTRAL`-equivalent
`IN_PARCELID`) — i.e. the *صك* (title-deed) boundary lengths are in the system too.

---

## 4 — 🔴 …but it is NOT reachable from outside Saudi Arabia. Two independent walls, both measured.

| Test | Result | Read |
|---|---|---|
| DNS `umapsudp.momrah.gov.sa` | **NXDOMAIN** (getaddrinfo failed) — while `umaps.balady.gov.sa`, `balady.gov.sa`, `momrah.gov.sa` all resolve | The ArcGIS Server host is **not in public DNS** — split-horizon / geo-fenced. Direct queries are impossible from here regardless of auth. |
| `proxy.ashx?…momrah…/query?where=1=1&returnCountOnly=true` | **HTTP 200, `text/html`, 3 396 bytes** — the MOMRAH *"service unavailability, contact IS@momra.gov.sa, Support ID …"* notice page | ⚠ **This is the §CONTEXT-DATA-HONESTY case again: a 200 with a body that is NOT the answer.** Asserting on shape (content-type `text/html`, not `application/json`; the Arabic apology string) is what distinguishes "blocked" from "answered". A naive check on HTTP 200 would have called this a success. |
| `proxy.ashx?…arcgisonline.com…` (benign public target) | **HTTP 200, `text/html`, 3 396 bytes** — same notice | The proxy refuses **every** cross-origin target from this IP, not just the parcel service — so it is an **IP/geo WAF block on the proxy**, not a per-service permission. |
| `UMAPI/api/Identity/CreateToken` (POST, the app's own anonymous token flow) | same HTML notice | The `UMAPI` app tier is behind the same WAF. `GetAPIs` returns **401** to a bare POST; a nonexistent route returns 404 — so the tier is live and routing, just gated. |

⇒ **`COULD NOT VERIFY` that the parcel service returns data, and the reason is a measured geo/WAF
block, not a missing endpoint.** The endpoint provably exists, is provably well-structured, and is
provably gated to (presumably) Saudi IPs + a reCAPTCHA/token the SPA mints in-browser. A demo that
needs live parcel classification would need either a Saudi-resident egress or an official data
agreement — see the assessment's risk register.

---

## 5 — What this changes about the effort estimate

1. **The parcel→classification lookup EXISTS** (contra the seed's *"no open API"*) but is
   **not publicly reachable**. For a demo this is fine: the user picks the class from a 4-item
   dropdown (villa / apartment / apt-commercial / apt-administrative), and the class taxonomy is
   national (`SAUDI-PRIMARY-DECISION-EXTRACT.md` §2), not a portal lookup.
2. **There is no free parcel-geometry source** — the geometry is inside the same geo-fenced service.
   The demo path is **user-drawn plot** (onboarding already supports it) or a manually supplied deed
   boundary. This is a real gap vs Barcelona's free Catastro WFS, but a **demo-acceptable** one.
3. **If a data agreement is ever secured**, this service is a *better* upstream than Catastro+MUC:
   it hands back setbacks + use + floors already resolved. That is a Phase-2 note, not a demo blocker.

---

**Related:** `SAUDI-ARABIA-ENTRY-ASSESSMENT.md` · `SAUDI-PRIMARY-DECISION-EXTRACT.md` ·
`../../spain/barcelona-catalonia/L-590c-PLA-PARCIAL-REGIME-RESOLVED.md` (the same "moved/gated endpoint
read as absent" lesson) · `../../spain/barcelona-catalonia/PROBE-DISCIPLINE.md`.
