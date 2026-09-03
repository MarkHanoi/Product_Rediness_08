# LANE ME-GULF — MIDDLE EAST (Gulf / GCC) parcel wiring

> Lane: intl-parcels/me-gulf · Probed **2026-09-02**, every host **re-probed 2026-09-03** from this
> environment (Windows, Git Bash) · UA `PRYZM-Research/1.0 (+https://pryzm.app; contact
> pryzmhello@gmail.com)` · Method binding: the Europe/ME sweep's — every claim is PROBE-VERIFIED
> live (HTTP status + a payload fact, transcript saved) or UNKNOWN with the probe named. A gated
> service is a **declared deferral with the live gate transcript + reviewBy**, never "absent".
> ⛔ NO commit (orchestrator integrates).
>
> Reuses: `audit/geo-expansion/2026-09-02/me-sweep.md` (the probe-verified channel map) · the
> L-606 findings · the LU/SE deferral precedent (`countryAdapters/se/seNgpGate.ts`, C74 §3.2/3.4) ·
> the L-12871/L-12887 national-jurisdiction resolver.
>
> Transcripts (captured this session): `transcripts-me-gulf/{dubai,abudhabi,saudi,kw-bh-om}.txt`.

## ⭐ HEADLINE

**Every Gulf parcel channel is GATED or vantage-BLOCKED — no keyless parcel layer exists for any of
them.** The founder asked to probe Dubai and Abu Dhabi HARD past the viewer; I did (AGOL org
enumeration, DKAN REST, SDI hosts, GetCapabilities-is-not-an-inventory), and there is no keyless
official layer to wire. So the deliverable per jurisdiction is a **declared deferral naming the exact
gate** — plus the correctness fix the probe exposed:

> **The latent Saudi mislabel is closed.** `SAUDI_ARABIA_BBOX` (lon 34.4..55.7 / lat 16.3..32.2)
> covers Dubai (55.27°E), Abu Dhabi, Kuwait City and Bahrain. Before this lane, the SA
> `footprint-fallback` row was the ONLY Gulf row, so a click in the UAE / Kuwait / Bahrain matched
> **only Saudi** and was labelled *Saudi* (and near the border could be nearest-polygon-**annexed** to
> Saudi — the Vaduz→CHE class L-12887 named). This lane adds AE/KW/BH/OM to the national boundary
> set as **claimable rivals**, so those clicks now CLAIM their own country and the SA row is filtered
> out. Verified: `Dubai/Abu Dhabi/Sharjah → [AE]`, `Kuwait City → [KW]`, `Manama → [BH]`,
> `Muscat → [OM]`, `Riyadh/Dammam → [SA]`, `Doha → [QA,SA]` (QA lane intact), and **Qatar REFUSES**
> (not annexed to Saudi).

| Jurisdiction | Verdict | Gate (exact) | Row |
|---|---|---|---|
| **AE — Dubai** | DEFERRAL(vantage-network-fence) | Dubai Pulse / geodubai.dm.gov.ae / gis.dm.gov.ae TCP-timeout (~21 s) on every foreign vantage; no official keyless AGOL FeatureServer | `AE` footprint-fallback (note names it) |
| **AE — Abu Dhabi** | DEFERRAL(waf) | data.abudhabi F5 "Request Rejected" on every machine path; DKAN API TCP-timeout; 5 AD-SDI hosts NXDOMAIN; UAE-PASS unmeasured | `AE` footprint-fallback (note names it) |
| **SA — Saudi** | DEFERRAL(token-sso) — **L-606 DELTA** | ArcGIS root/portal now answer a foreign IP; every DATA folder = `499 Token Required`; viewer auth via ssoapp.balady.gov.sa (Balady SSO / Nafath) | `SA` footprint-fallback (note UPDATED) |
| **KW — Kuwait** | DEFERRAL(no-open-channel) | PACI hosts TCP-unreachable / cert-expired / connection-reset; no REST surface at guessable paths | `KW` footprint-fallback |
| **BH — Bahrain** | DEFERRAL(ekey-identity) | SLRB cadastral services behind national eKey; data.gov.bh = statistics only | `BH` footprint-fallback |
| **OM — Oman** | DEFERRAL(no-open-channel / vantage) | NSDI onsdi.ncsi.gov.om drops foreign TCP; housing ministry WAF-403 | `OM` footprint-fallback |

All six back-descriptors (with gate class, evidence, transcript path, retirement condition, reviewBy
**2027-03-02**) live in `packages/site-parcel-data/src/countryAdapters/gulf/gulfDeferrals.ts`
(`GULF_DEFERRALS`), and `assertGulfDeferralsNotExpired(todayIso)` throws BY NAME after the reviewBy.

---

## 1 — DUBAI (probed HARD past the viewer)

**Verdict: DEFERRAL(vantage-network-fence).** The authoritative data hosts drop foreign SYNs; there
is no official keyless mirror.

- **Data hosts (re-probed 2026-09-03, matching the 2026-09-02 French-IP sweep):**
  `www.dubaipulse.gov.ae`, `geodubai.dm.gov.ae/arcgis/rest/services`, `gis.dm.gov.ae` → **TCP connect
  timeout ~21 s (RC=28)** each. The CDN-fronted corporate site `www.dm.gov.ae` answers **HTTP 200**
  (Azure Front Door) — proving it is a data-tier network fence, not a whole-domain outage.
- **Past the viewer — AGOL enumeration (arcgis.com is NOT on the fenced network):**
  - The official-looking org **`dubaimunicipalityitd`** (Dubai Municipality IT) exposes exactly **ONE
    public item** — a *"Dubai Municipality HQ"* web map (id `5ef062c43514440cb5831d75dbcdf42c`) whose
    `/data?f=json` has **`operationalLayers: 0`** and an OpenStreetMap basemap. **No hosted parcel
    FeatureServer.**
  - A Dubai-parcel FeatureServer search surfaces only **third-party demos**: `Urban_Sydney` ("Dubai
    Urban Model Public View"), `Sydney_Geodesign`, `gistec_agol` (GISTEC = Esri's UAE reseller —
    "Dubai Public View"), `jsaligoe_esri` ("Community Divisions in Dubai Municipality **DEMO**"),
    `ralouta_smartdubai` ("Parcel_zoning_3D_w_canal" — a 3D **scene** tile service, an employee demo,
    not a queryable point→parcel cadastre). **None is the authoritative DM/DLD parcel layer.**
  - `dubailand.gov.ae` (Dubai Land Department — the actual title authority) answers 404 at root;
    `gisservices.dm.gov.ae`/`geohub.dubai.ae` are NXDOMAIN.
- **Envelope rules:** Dubai 2040 / DM zoning is document-class; the zoning GIS sits behind the same
  fenced hosts — UNKNOWN(vantage).
- **retiredBy:** the four data hosts re-probed from an in-UAE/GCC vantage (to separate geo-fence from
  outage), OR a Dubai Pulse account authorised for the `dm-gis` parcel datasets; then a client against
  RECORDED BYTES. Transcript: `transcripts-me-gulf/dubai.txt`.

## 2 — ABU DHABI (probe again — F5-WAF confirmed)

**Verdict: DEFERRAL(waf).** The catalogue exists; its machine layer is F5-fenced and the SDI hosts are
dead.

- `data.abudhabi/opendata/data.json` and `…/search/type/dataset?query=parcel` → **F5 BIG-IP
  "Request Rejected"** (support IDs `11709459135382448544`, `…54836965`).
- `…/opendata/api/1/metastore/schemas/dataset/items` (DKAN REST) → **TCP timeout (25 s)**;
  `…/api/1/search` → a 500-class *"unexpected error"*.
- All five legacy AD-SDI hosts — `geoportal.dmt.gov.ae`, `sdi.gsec.abudhabi`, `geoportal.abudhabi.ae`,
  `www.abudhabimaps.ae`, `adgeospatial.gov.ae` → **NXDOMAIN / unreachable**.
- AGOL: **0** official Abu Dhabi parcel FeatureServers (4 queries, all `total:0`).
- **UAE PASS** (Emirates-ID national identity) is the expected credential class, but nothing reachable
  presented a login to measure it — recorded as **unmeasured**, not assumed.
- **retiredBy:** `data.json` + the DKAN API re-probed from an in-UAE vantage, dataset licences read, a
  UAE-PASS class measured. Transcript: `transcripts-me-gulf/abudhabi.txt`.

## 3 — SAUDI (the L-606 update)

**Verdict: DEFERRAL(token-sso) — the fence CHANGED CLASS since L-606.** The registry row note was
stale ("IP geo-fenced (WAF-blocks non-SA IPs)") and is **updated**:

```
umaps.balady.gov.sa/                          → 301 → umaps.momah.gov.sa
umaps.momah.gov.sa/server/rest/services?f=json → 200 {"currentVersion":11.5,"folders":["Hosted","umaps","Utilities"],"services":[]}
umaps.momah.gov.sa/server/rest/services/umaps  → 200 {"error":{"code":499,"message":"Token Required"}}  (x3 stable; Hosted folder too)
umaps.momah.gov.sa/portal/sharing/rest?f=json  → 200 {"enterpriseVersion":"11.5.0","enterpriseBuild":"56755"}
umapsudp.momrah.gov.sa/…                        → DNS RC=6 (old backend dead)
```

So the ArcGIS Enterprise 11.5 root + portal now **answer a foreign IP** (they did NOT in the L-606 WAF
era — the WAF killed TCP), but every DATA folder is behind an **ArcGIS token**, and the viewer
authenticates against **`ssoapp.balady.gov.sa`** (Balady SSO / Nafath — Saudi national identity). **An
in-SA proxy alone NO LONGER suffices; the gate is credential-class** (Balady SSO / Nafath, or a MOMRAH
data agreement). Rules for SA remain banked NATIONALLY (2024 MOMRAH decision) — only parcels+zoning
geometry are behind this gate. Transcript: `transcripts-me-gulf/saudi.txt`.

## 4 — KUWAIT / BAHRAIN / OMAN (honest one-liners)

- **KW — DEFERRAL(no-open-channel).** PACI (the parcel/address authority) hosts are TCP-unreachable /
  schannel cert-expired / connection-reset from our vantage; the one responsive host exposes no ArcGIS
  REST at guessable paths (302→/error/404). Gate unmeasurable from here → re-probe in-GCC.
- **BH — DEFERRAL(ekey-identity).** SLRB (Survey & Land Registration Bureau) corporate site (200) names
  cadastral services routed through the national **eKey** login; every guessable GIS host is NXDOMAIN;
  `data.gov.bh` holds only statistics tables (q=parcel → 4 subdivision-regulation tables, no geometry).
- **OM — DEFERRAL(no-open-channel / vantage).** NSDI `onsdi.ncsi.gov.om` resolves but drops foreign
  TCP (~21 s); the Ministry of Housing & Urban Planning (krooki authority) WAF-403s; `data.gov.om` is
  statistics-only. Gate class UNKNOWN (registration vs geo-fence) → re-probe in-region.

Transcript: `transcripts-me-gulf/kw-bh-om.txt`.

## 5 — QATAR (out of lane — recorded)

Qatar is the **QA lane's** jurisdiction (me-sweep: keyless CadastrePlots, PIN 1010028; a `QA`
`kind:'cadastral'` row already exists in `registry.ts`). It is deliberately **NOT** added to the
national boundary set here — a Qatar point correctly **REFUSES** (`outside-every-candidate-polygon`,
candidates `[SAU, ARE]`), so it is never annexed to Saudi, and the QA row wins Doha by specificity.
When the QA lane wants Doha to CLAIM `QA`, add QAT to the boundary set the same way this lane added
AE/KW/BH/OM (`resolver-additions-me-gulf/extract.mjs` already extracts QAT).

---

## 6 — WHAT SHIPPED (per-jurisdiction deliverable)

**Adapter — one shared multi-jurisdiction module** (the AU-lane "one client parameterised by
regionCode — DRY without hiding per-jurisdiction provenance" shape, applied to deferrals like SE):
`packages/site-parcel-data/src/countryAdapters/gulf/` — `gulfJurisdiction.ts` (4 country pre-filter
bboxes + predicates), `gulfDeferrals.ts` (`GULF_DEFERRALS` — 6 self-announcing dated deferrals + the
refusal builder + the reviewBy assertion), `gulfParcelProvider.ts` (one deferred resolver by
regionCode — never a fake client, [[fake-more-capable-than-real]]), `index.ts`.

**Registry rows** (`parcelProviders/registry.ts`): four new `footprint-fallback` rows `AE`/`KW`/`BH`/`OM`
routed by `claimsNation(cc)` (the resolver decides — no rival bbox); the `SA` row note updated to the
L-606 token/SSO delta; four `REGION_BBOX` specificity entries.

**Resolver routing extension** (`jurisdiction/nationalJurisdictionResolver.ts` + `data/
nationalBoundaries.json`): AE/KW/BH/OM added to the national boundary set as CLAIMABLE countries, from
the SAME pinned ne_10m source (sha256 `239eec57…`, byte-identical to the file's `sourceSha256`), via a
DP-100m pipeline **validated byte-exact by re-deriving SAU** (my SAU = 11 rings / 1887 verts / ring0
1560 / ring0[0] `[50.80787,24.74665]` == the stored SAU exactly). Four `CANDIDATE_PREFILTERS` rows. The
exact geometry + re-apply recipe are durable at `resolver-additions-me-gulf/`.

**Tests — recorded-live fixtures** (`__tests__/meGulfRegistryWiring.test.ts`, 32 tests, all green):
routing, the Saudi-mislabel fix, the deferral honesty (transient ≠ absent; L0 token; transcript files
exist), the reviewBy assertion, and the boundary-set provenance. Plus 4 interior CONTROLS added to the
shared `nationalJurisdictionResolver.test.ts`.

**LIVE click per OPEN jurisdiction:** none — there is no open Gulf parcel jurisdiction. Every one is a
declared deferral, so the deliverable is the gate transcript + reviewBy above.

## 7 — VERIFICATION (this environment, 2026-09-03)

- `tsc -p tsconfig.json --noEmit` → **0 errors in any ME-GULF file** (1 unrelated pre-existing error
  in `frPrescriptionGeometry.test.ts` — a missing `Pt` export from another lane's WIP).
- `vitest` over `meGulfRegistryWiring` + `nationalJurisdictionResolver` + `parcelRegistryWiring` +
  `parcelRegistryNationalWiring` + `meOpenRegistryWiring` + `jurisdictionSpecificity` +
  `parcelRegistry` → **279 / 279 passed**.
- Live routing (`resolveParcelCandidates`): Dubai/Abu Dhabi/Sharjah → `[AE]`; Kuwait City → `[KW]`;
  Manama → `[BH]`; Muscat → `[OM]`; Riyadh/Dammam → `[SA]`; Doha → `[QA, SA]` (QA lane intact).

## 8 — SHARED-TREE / HANDOVER NOTES

- `registry.ts`, `index.ts`, `nationalJurisdictionResolver.ts` + its JSON, and the resolver test are
  SHARED with concurrent lanes (au/ro/gr/hu/il/qa/tr/us/hr/lv/**si**). The row-in is applied AND
  recorded in `barrel-additions-me-gulf.txt` "regardless" (the lane rule) so the orchestrator can
  re-apply after churn. During this session the SI lane's `SVN` boundary geometry was seen to appear
  then be clobbered by a concurrent write — the resolver test stays consistent because it counts
  `CONTROLS == countries` and both moved together for MY four; **if SVN re-lands without a SI control,
  that shared test fails on the SI lane's row, not this one.** The durable re-apply record for MY four
  is `resolver-additions-me-gulf/`.
- No new refusal-token spelling minted (L-12874): the deferrals ride the L0 `endpoint-unreachable:`
  transient token; the distinguished `GULF_DEFERRED_TOKEN` lives inside the reason string.
