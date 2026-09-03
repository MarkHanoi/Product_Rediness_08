# LANE GR — GREECE parcel adapter · findings (2026-09-03)

**Verdict: LIVE keyless cadastre (parcel leg DELIVERED + PROVEN) · rules DOCUMENTS-ONLY · routing DORMANT on a named jurisdiction gate.**

The channel hint ("Hellenic Cadastre INSPIRE services — likely GATED") was **REFUTED by live re-probe.**
The gate is on the *old* INSPIRE path, not the current channel.

---

## 1. What was PROVEN live (2026-09-03, this machine)

- **Operating-cadastre parcels are a KEYLESS ArcGIS Online FeatureServer.** Discovered by tracing
  the official public viewer `maps.ktimatologio.gr` (ArcGIS Experience Builder) → its runtime
  config `https://maps.ktimatologio.gr/cdn/2/config.json` → the org
  `services-eu1.arcgis.com/40tFGWzosjaLJpmn`. Five parcel layers, one per cadastre lifecycle stage
  (γεωτεμάχια): **LEITOURGOUN** (λειτουργούν = OPERATING — consumed), ANARTHSH (public display),
  PROKATARKTIKA (preliminary), APOKLEISTIKES, DOULEIES.
- **Layer:** `GEOTEMAXIA_LEITOURGOUN_ON_gdb/FeatureServer/0` — Feature Layer, polygon,
  `capabilities: "Query"`, `maxRecordCount 2000`. Fields: **KAEK** (id), MAIN_USE, PERCENTAGE,
  DESCR, PROP_VERT, PROP_HOR, LINK, AREA, PERIMETER.
- **Identifier = KAEK** (Κωδικός Αριθμός Εθνικού Κτηματολογίου), the 12-digit national cadastre code.
  Carried OPAQUE (never split into νομός/ΟΤΑ/τομέας components — that grammar is not served).

### THE LIVE CLICK PROOF AT THE CAPITAL
```
GET .../GEOTEMAXIA_LEITOURGOUN_ON_gdb/FeatureServer/0/query
    geometry={x:23.7348,y:37.9755,sr:4326}  (Athens / Syntagma Square)
    geometryType=esriGeometryPoint spatialRel=intersects inSR=4326 outSR=4326
→ HTTP 200 · 1 feature · KAEK=050095701001 · AREA=10839.77 m² · 10-vertex WGS84 ring
```
Falsification control (same query): **Rome (Italy) → NO FEATURE**; **Saronic Gulf sea → NO FEATURE**
— the Athens KAEK is location-bound, not a constant.

### CRS + AREA discipline
Layer stored in EPSG:3857; reprojects server-side. The click path asks `inSR=4326&outSR=4326` →
WGS84 ring. `AREA` is the register's own m² (matches PERIMETER 404.3 m); this adapter carries it
verbatim and computes NO geometry — so requesting WGS84 is safe, NOT the Madrid/Murcia
measure-after-reprojection trap. (`Shape__Area` = 17 487 m² is the Web-Mercator-distorted area,
deliberately not read.)

### Negative probes (recorded so they are not re-attempted)
- OLD INSPIRE path `gis.ktimanet.gr/inspire/rest/services/cadastralparcels/.../InspireFeatureDownload/service?...GetCapabilities` → **HTTP 404** (geoportal migrated to a Next.js app).
- `geoportal.ypen.gr`, `www.epoleodomia.gov.gr` → connect-fail (census 2026-09-02, re-confirmed).

---

## 2. The STRUCTURAL routing blocker (declared deferral, named gate)

**Greece is NOT modelled by the national-jurisdiction resolver.** Measured live 2026-09-03:
`resolveNationalJurisdiction(37.9755, 23.7348)` → `{ok:false, reason:'no-national-candidate'}`.
`nationalBoundaries.json` carries **21** countries (a concurrent lane expanded it 16→21 mid-session,
adding AE/BH/KW/OM/SI) — **GRC is not among them.** Therefore `claimsNation('GR')` is **false
everywhere** and the registry row is **DORMANT** (a Greek click falls to the OSM footprint —
honest; the resolver refuses cleanly rather than mis-claiming Italy across the sea).

This is a deferral of the **routing** leg, NOT of the data. Two shared-infra wiring steps (this lane
may not edit those files under the barrel protocol) clear it — recorded in `GREECE_ROUTING_DEFERRAL`
(reviewBy **2027-03-01**):
1. add a **GRC boundary polygon** to `jurisdiction/data/nationalBoundaries.json` (the L-12871
   resolver's file) so `claimsNation('GR')` can become true;
2. add a **`gr` row to `server/jurisdiction/euCadastreProxy.js`** so `/api/parcel/gr` forwards to the
   FeatureServer (the PROXY-EE-LT-PL pattern). Until then a match self-corrects to footprint on 404.

The row is written as `kind:'cadastral'` (the source IS reachable — unlike RO, whose SERVICE gate is
NXDOMAIN → footprint-fallback) with `proxyPath:'/api/parcel/gr'` reserved, so clearing the gate is a
two-single-line flip.

---

## 3. Rules — DOCUMENTS-ONLY (honest no-rule-pack path)

No machine-readable rules channel was sweep-verified, so **no rule mapper was shipped.** Greek
building terms (όροι δόμησης: συντελεστής δόμησης = FAR, κάλυψη = coverage, ύψος = height) are set by
presidential decree in the **FEK gazette as PDF/scanned text + diagrams**; the street-alignment and
building lines (ρυμοτομική + οικοδομική γραμμή — the founder's Type-A objects) exist only as scanned
diagrams; the e-Poleodomia digitization channels are dead/unreachable. `grCountryAdapter.rules =
{ kind:'documents-only', reason:… }` states this as a value; `GR_APPLICABILITY_LADDER` records the
FEK-decree ladder as data. Retirement path: an FEK/AI legal-text extraction pipeline.

---

## 4. Deliverables

| File | Role |
|---|---|
| `countryAdapters/gr/grJurisdiction.ts` | `GREECE_BBOX` (specificity metric only) + `isInGreece` + `GREECE_ROUTING_DEFERRAL` (the resolver-gap as data) |
| `countryAdapters/gr/grKtimatologioClient.ts` | the ONE impure seam — reuses shared `queryArcgisRestPointIntersect`; classifies to FetchOutcome (found/absent/transient); by-KAEK `where` query |
| `countryAdapters/gr/grParcelProvider.ts` | `GrCadastralParcel`, `parseGrParcelFeature`, `resolveGrParcelAtWgs84Point`, `resolveGrParcelByKaek`, `GR_INCOMPLETE_CADASTRE_CAVEAT` |
| `countryAdapters/gr/grSources.ts` | `GR_SOURCES` via `defineSources('GR', …)` — one probed row (licence YELLOW, verifiedDate null — sweep flagged licence unconfirmed) |
| `countryAdapters/gr/index.ts` | `grCountryAdapter` (§J shape) + documents-only rules + explicit re-exports |
| `__tests__/grKtimatologioAdapter.test.ts` + `fixtures/gr-athens-2026-09-03/recorded-live-2026-09-03.json` | 15 tests, recorded-live fixtures (Athens point, KAEK lookup, sea-absence, error-body) |
| `parcelProviders/registry.ts` | GR import + row (`claimsNation('GR')`, dormant) + REGION_BBOX entry — **SHARED** |
| `src/index.ts` | `export * from './countryAdapters/gr/index.js';` — **SHARED** |
| `barrel-additions-gr.txt` | re-apply source for the orchestrator on conflict |

### Verification
- **Tests:** `pnpm --filter @pryzm/site-parcel-data exec vitest run grKtimatologioAdapter` → **15/15 pass.**
- **Typecheck:** `pnpm --filter @pryzm/site-parcel-data typecheck` → the only error is a PRE-EXISTING,
  UNRELATED `'Pt'` import in the untracked `frPrescriptionGeometry.test.ts` (a concurrent lane's file);
  **zero GR errors.**
- **Falsification:** corrupting the served KAEK in the fixture fails 3 assertions; restore is
  **byte-identical** (sha256 `bc395a9d2692213559893979b62f245b775d9b74b0b6e06d8ece1c7036af5d40`);
  re-run 15/15. Live location-control: Rome/sea → NO FEATURE.
- **Concurrent-lane note:** `nationalJurisdictionResolver.test.ts` shows 2 failures (16→21 CONTROLS
  count; Slovenia neighbour rings) — these come from another lane's ` M` edits to
  `nationalBoundaries.json` / `nationalJurisdictionResolver.ts`, not from GR (the resolver test
  imports nothing GR/registry).

**NO commit made** (per brief).
