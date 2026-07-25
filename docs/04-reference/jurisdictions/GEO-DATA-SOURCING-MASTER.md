# GEO-DATA SOURCING — MASTER (terrain + building-height, per jurisdiction)

> **Status: CANONICAL SOURCING REFERENCE — single source of truth for terrain + building-height
> data provenance.** Founder-verified research, 2026-07-25. **When any other doc or code disagrees
> with this table on *where a dataset comes from, under what auth, under what licence*, this doc is
> authoritative** and the other must be corrected (governance order: VISION → ARCHITECTURE → C01–C60
> → ADRs → SPECs; a reference doc like this is the sourcing record the ADR and the North Star point
> at). The *engineering* status of any pipeline (what is wired / probed / rendering) lives in the two
> coverage docs (`HEIGHTS-COVERAGE-AND-BLOCKED.md`, `../CONTEXT-TERRAIN-COVERAGE.md`), which now defer
> here for sourcing. The *decisions* this map encodes are recorded in
> [ADR-0277](../../02-decisions/adrs/ADR-0277-geo-data-sourcing-map-open-datasets-derived-heights.md).

**Scope.** Two independent data axes, per country/region:
1. **Terrain** — a bare-earth DTM (Digital Terrain Model) → the terrain mesh under the buildings.
2. **Building height** — a per-building measured height, either a ready-made **height product**, a
   dedicated **building-surface model**, a **native height attribute** on a vector building layer, or
   **DERIVED** from an open DSM − DTM subtraction (or a ready-made nDSM / MNH raster).

**Honesty frame (§CONTEXT-DATA-HONESTY / C58 §1.4).** "Measured height" = surveyed / LiDAR /
photogrammetric. A floor-count × storey-height is `derived-levels`, never a measurement. A default
(9 m) is `assumed` and renders visibly translucent. Provenance is mandatory on every derived value
(`source`, `algorithm_version`, `epoch`, `confidence`) — a value without provenance MUST NOT ship.

**Cross-refs:** [ADR-0277](../../02-decisions/adrs/ADR-0277-geo-data-sourcing-map-open-datasets-derived-heights.md)
(the decisions) · [CONTEXT-SCENE-COMPILER-AND-TERRAIN-NORTH-STAR.md](../CONTEXT-SCENE-COMPILER-AND-TERRAIN-NORTH-STAR.md)
§2/§6.7 (the nDSM height engine + the per-country table this fills) · its
[-IMPLEMENTATION-PLAN.md](../CONTEXT-SCENE-COMPILER-IMPLEMENTATION-PLAN.md) §6 (the C-CONTEXT contract
need) · [C57 — Parcel Data Layer](../../02-decisions/contracts/C57-PARCEL-DATA-LAYER.md) ·
[C58 — Zoning Rules & Buildable Envelope](../../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) ·
`HEIGHTS-COVERAGE-AND-BLOCKED.md` · `../CONTEXT-TERRAIN-COVERAGE.md` · `LOD-RATE-MASTER.md`.

---

## 1 — Master sourcing table

Verdict legend: **OK** = both axes solvable with open, commercial-OK data (some behind a free
account or an engineering step). **IMPROVING** = a real gap actively closing via a national programme.
**BLOCKED** = no open commercial data located nationally; needs an agreement or a global fallback.

Approach legend: **keyless** = open HTTP, no credential. **free account** = open licence, free
registration gate. **derive** = no ready-made height product; compute from open DSM − DTM (or a
ready-made nDSM/MNH raster). **per-Land** = Germany is 16 separate connectors, not one national source.

| Country / Region | Terrain dataset | Terrain endpoint | Terrain auth | Terrain licence | Height dataset | Height endpoint | Height auth | Height licence | Verdict | Recommended approach / CI notes |
|---|---|---|---|---|---|---|---|---|---|---|
| **🇸🇪 Sweden** | Markhöjdmodell 1 m COG — STAC `api.lantmateriet.se/stac-hojd/v1` (catalog/collections/items **public**; COG assets on `dl1.lantmateriet.se` 401) | Lantmäteriet Geotorget / API-portalen | **OAuth2 `client_credentials`** (`LANTMATERIET_CLIENT_ID` + `LANTMATERIET_CLIENT_SECRET`) via `apimanager.lantmateriet.se/oauth2/token` — **NOT** BankID/eIDAS | CC BY 4.0 | **Byggnad** national footprints `.../geodatakatalog/sokning/v1/byggnad/v1` (exists, auth-gated 401; **no explicit height attr**) **+ derive DSM−DTM** from LiDAR | OAuth2 `client_credentials` (same) | same host | CC0 | **OK — VERIFIED live 2026-07-25** — machine-to-machine; blocker is *organisation onboarding for client creds*, not BankID | Request **organisation API onboarding** from Geodata Support (M2M client credentials for the open HVD datasets — cite EU Open Data Directive). Store `LANTMATERIET_CLIENT_ID`/`SECRET` as repo secrets; CI: `client_credentials`→token→download COGs. Heights = derive DSM−DTM (Byggnad has no height). |
| **🇫🇮 Finland** | Elevation Model 2 m/10 m (NLS/MML) — WCS | MML WCS (avoin-karttakuva) | **free API key** (`MML_API_KEY`) | CC BY 4.0 | *(none nationally)* | — | — | — | **OK** — terrain solved; no national height source | Store `MML_API_KEY` (repo secret); bake terrain. Helsinki has open LoD2 as a later height candidate. |
| **🇩🇰 Denmark** | DHM (Danmarks Højdemodel) — WCS/Download | Datafordeler | **API key** (`DATAFORDELER_API_KEY`) | Danish Open Data | GeoDanmark Buildings — WFS/Download | Datafordeler | **API key** (same `DATAFORDELER_API_KEY`) | Danish Open Data | **OK** — both solved; blocked only on a repo-admin action | **Add `DATAFORDELER_API_KEY` as a GitHub *repository* secret** (it is currently only a Fly secret), then bake both. ⚠ See §4 reconciliation: Datafordeler Basic Auth was RETIRED (git `1fc5bc8b`); the 2026 host expects `apikey=`. If the apikey path is not honoured, fall back to a Datafordeler service user (`DATAFORDELER_USERNAME`/`DATAFORDELER_PASSWORD`) or a Dataforsyningen token (`DATAFORSYNING_TOKEN`) — authority: SDFI. |
| **🇳🇴 Norway** | NDH (Nasjonal detaljert høydemodell) — WCS/WFS/REST/Download | hoydedata.no / Geonorge | *none (keyless)* | NLOD | **DERIVED** from NDH DOM − DTM (no open national height product; FKB is commercial) | hoydedata.no (same) | *none (keyless)* | NLOD | **OK** — terrain open; heights derivable, no commercial licence | Derive: `max(DSM − DTM)` inside each building outline (pattern: `github.com/geimas5/DTMDEMtoBuildingHeight`; PRYZM: robust P90/trimmed-median per §nDSM, never max). **Do NOT license FKB.** |
| **🇬🇧 United Kingdom** | EA / NRW / Scottish / DAERA LiDAR Composite DTM + DSM — WMS/Download | environment.data.gov.uk | *none (keyless)* | Open Government Licence | **DERIVED** from EA DSM − DTM + OS Open Buildings / OSM footprints (OS Building Height Attribute is commercial) | environment.data.gov.uk (same) | *none (keyless)* | Open Government Licence | **OK** — terrain open; heights derivable, no OS licence | Adapt GBDEM height extraction (`github.com/PlaceBasedCarbonCalculator/GBDEM`). **Skip OS's commercial Building Height Attribute entirely.** EA = England; Scotland/Wales/NI via NRW/Scottish/DAERA portals. |
| **🇩🇪 Germany** *(national, per-Land)* | per-Land DGM/DTM — WCS/Download | individual Land geoportals | *varies (mostly none)* | mostly DL-DE / Open Data | per-Land LoD2 building models — `measuredHeight` | individual Land geoportals | *varies* | mostly DL-DE / Open Data | **OK for Länder checked** — extend Land by Land | **16 connectors, NOT one national source.** Verify each Land's portal (pattern: GDI-DE / govdata.de). Rows below detail the two flagship Länder. Bavaria/Munich is now OPEN (see below) — supersedes the earlier "Bavaria BLOCKED / ZSHH-restricted" note. |
| **🇩🇪 Germany — Berlin** | ATKIS DGM 1 m — WMS | gdi.berlin.de/services/wms/dgm1 | *none (no auth at all)* | Datenlizenz DL-Zero-2-0 | LoD2 CityGML (flächendeckend) | daten.berlin.de (3d-gebaeudemodelle LoD2) | *none* | DL-DE/Zero-2-0 | **OK** — fully solved; easiest in the set, no auth at all | Pure engineering; no founder action. Good first German connector. |
| **🇩🇪 Germany — Bavaria (Munich)** | DGM1 1 m — Metalink bulk download | geodaten.bayern.de/odd/a/dgm/dgm1/meta/metalink | *none (keyless)* | CC BY 4.0 | LoD2 CityGML (~9.8 M objects) | geodaten.bayern.de/odd/a/lod2/citygml/meta/metalink | *none (keyless)* | CC BY 4.0 | **OK** — needs a Metalink-aware downloader | Build an aria2c/Metalink downloader (`bayern_metalink_download.sh`). Pure engineering; no founder action. |
| **🇵🇹 Portugal** | National LiDAR MDT (bare-earth) 0.5–2 m | undocumented STAC API `cdd.dgterritorio.gov.pt/dgt-be/v1/search` (**NOT** the public OGC API) | **free account + email confirmation** (`DGT_CDD_EMAIL` / `DGT_CDD_PASSWORD`) | CC BY 4.0 | **DERIVABLE** from MDS − MDT (national LiDAR DSM) | same STAC | same account | CC BY 4.0 | **OK** — free account; not a genuine gap; auth fragile (unofficial API) | Client already committed: `tools/context-bake/sources/dgt_cdd_client.py`. **Best-effort: wrap in try/except, never hard-fail CI** — the reverse-engineered STAC can change without notice. No national FOOTPRINT layer (use Overture/OSM). |
| **🇧🇪 Belgium — Flanders** | DTM/DSM (DHMV) — Download/WFS | download.vlaanderen.be (AGIV / Digitaal Vlaanderen) | **free account** (registration + activation email) | Open Data | 3D GRB — Gebouw LoD1 (sourced from DHMV) | download.vlaanderen.be (same) | **free account** | Open Data | **OK** — both solved; one free account gate | One registration (free gate, not a licensing blocker). Store credentials as repo secrets when the fetcher lands. |
| **🇧🇪 Belgium — Brussels-Capital** | 1 m DTM (national NGI mosaic; Paradigm LiDAR flown Oct 2021) — Download/WMS | geo.be (federal NGI) + datastore.brussels | *none (keyless)* | CC0 (UrbIS) / Open Data | UrbIS 3D Constructions (LoD2-equivalent) + UrbIS Landscape — Download/WFS | datastore.brussels | *none (keyless)* | CC0 | **OK** — fully solved & keyless | ⚠ **The earlier ✗ BLOCKED verdict was a RESEARCH ERROR, now corrected** — Brussels is fully open and keyless. Supersedes `../CONTEXT-TERRAIN-COVERAGE.md` §2.2's Brussels-BLOCKED prompt. |
| **🇧🇪 Belgium — Wallonia** | MNT 0.5 m (2021–2022 LiDAR) — Download/WMS | geoportail.wallonie.be | *none (keyless)* | open regional licence (SPW attribution) | **MNH — Modèle Numérique de Hauteur** (ready-made height / nDSM raster) + MNS | geoportail.wallonie.be (same) | *none (keyless)* | open regional licence (SPW attribution) | **OK** — fully solved | **Use MNH directly — no DSM − DTM subtraction needed** (it is a ready-made height raster). Earlier verdict was too conservative. |
| **🇮🇹 Italy** | Tinitaly DEM 10 m (fallback) + PST LiDAR DTM 1 m (growing national coverage, Ministero dell'Ambiente) — Download/WMS/WFS | gn.mase.gov.it | *none (keyless)* | CC BY 4.0 | PST DSM − DTM (partial national, expanding via €30 M PNRR; regional patchwork — Tuscany / Emilia-Romagna / Ferrara / Piedmont / Friuli each publish own DTM/DSM) | gn.mase.gov.it + per-region geoportals | *none (keyless)* | CC BY 4.0 / regional | **IMPROVING** — was a real regional-patchwork gap; national programme actively closing it | Use PST where it covers the AOI; fall back to regional geoportals. **No unified national height connector yet — re-check quarterly.** |
| **🇸🇦 Saudi Arabia** | *(no confirmed national open DEM — GEOSA publishes none)* | — | — | — | *(no confirmed open building heights — Balady geo-fenced, 403 outside SA)* | — | — | — | **BLOCKED nationally** — needs a GEOSA/Balady data agreement | **Interim/global fallback ACCEPTED:** Terrain = **Copernicus GLO-30 DEM** (free, worldwide, keyless S3 bucket `copernicus-dem-30m`; a DSM, not bare-earth; attribution-only). Heights = **GlobalBuildingAtlas**. ⚠ **FABDEM** bare-earth is **CC-BY-NC-SA (non-commercial)** — avoid if redistributing. Authority: Saudi GEOSA. |
| **🇪🇸 Spain** | MDT (Modelo Digital del Terreno) 5 m/25 m/200 m + PNOA-LiDAR point clouds — Download/WCS | centrodedescargas.cnig.es (IGN/CNIG) | *none (keyless)* | CC BY 4.0 | **MDS Edificación (MDSnE2.5)** — DEDICATED building-only surface model (+ general MDS02/MDS05) | centrodedescargas.cnig.es (same) | *none (keyless)* | CC BY 4.0 | **OK** — fully solved; one of the best-provisioned (a dedicated building-height product) | **Heights come from MDS Edificación, NOT a DSM − DTM subtraction** — MDSnE2.5 isolates building surfaces directly. Direct connector. |
| **🇫🇷 France** | RGE ALTI national DTM — Download/WCS | geoservices.ign.fr / Géoplateforme (mirrored on data.gouv.fr) | *none (keyless)* | Licence Ouverte / Etalab (ODbL, CC-BY 2.0 compatible) | **BD TOPO** — building height is a native attribute of the `bâti` theme in the same 3D vector DB | geoservices.ign.fr (same) | *none (keyless)* | Licence Ouverte / Etalab | **OK** — fully solved; terrain + heights unified in one product | Native `hauteur` attribute — **no separate derivation step** (open since 1 Jan 2021). Already wired (4,635 Paris buildings at real heights). |
| **🇺🇸 United States** | USGS 3DEP 1/3/10/30 m DEM — WMS (keyless) / API (free OpenTopography key) | elevation.nationalmap.gov + portal.opentopography.org/API/usgsdem | *none keyless; free key via OpenTopography for the API* | Public domain | **Overture Maps Foundation Buildings** (heights computed from 3DEP LiDAR within OSM/Microsoft footprints) — cloud-native Parquet | overturemaps.org releases | *none (keyless)* | Open (ODbL-family / CDLA-Permissive) | **OK** — fully solved nationally (verify height-layer completeness per AOI given ongoing rollout) | Pull the latest Overture release (queryable via DuckDB/Athena). **Verify AOI coverage first** — height completeness varies during rollout. |

---

## 2 — Founder actions required (free-account registrations + repo-secret additions)

These are the *only* rows that need a human. Each is a **free** gate (registration or a repo-admin
action) — none is a paid licence.

| # | Jurisdiction | Action | Credential / secret name (verbatim) | Where |
|---|---|---|---|---|
| 1 | 🇸🇪 **Sweden** | Request **organisation** API onboarding at Geotorget/Geodata Support — machine-to-machine OAuth **client credentials** for the open datasets (NOT the citizen BankID/eIDAS login, which foreign orgs can't complete); add both as GitHub **repository** secrets. VERIFIED 2026-07-25: STAC metadata is public, COG assets are OAuth-gated (401), token endpoint supports `client_credentials`. Sweden also has a national **Byggnad** (buildings) dataset — footprints, no height → derive DSM−DTM. | `LANTMATERIET_CLIENT_ID` + `LANTMATERIET_CLIENT_SECRET` | Lantmäteriet Geodata Support |
| 2 | 🇫🇮 **Finland** | Get the free NLS open-data key; add as a **repository** secret | `MML_API_KEY` | asiointi.maanmittauslaitos.fi (NLS open data) |
| 3 | 🇩🇰 **Denmark** | **Add the existing Datafordeler key as a GitHub *repository* secret** — it is currently only a Fly secret, so CI bakes fail without it | `DATAFORDELER_API_KEY` *(fallbacks: `DATAFORDELER_USERNAME`/`DATAFORDELER_PASSWORD`, or `DATAFORSYNING_TOKEN`)* | portal.datafordeler.dk (mint) — authority SDFI |
| 4 | 🇵🇹 **Portugal** | Create the free DGT CDD account (email confirmation); add both as **repository** secrets | `DGT_CDD_EMAIL` / `DGT_CDD_PASSWORD` | cdd.dgterritorio.gov.pt (unofficial STAC — best-effort) |
| 5 | 🇧🇪 **Belgium — Flanders** | Register once (activation email) at download.vlaanderen.be; add credentials as repo secrets when the fetcher lands | *(no fixed env var yet — name it on wire-up)* | download.vlaanderen.be (Digitaal Vlaanderen) |
| 6 | 🇸🇦 **Saudi Arabia** | *(Blocked)* Pursue a GEOSA/Balady data agreement or in-country access. **No account unblocks the interim** — the global Copernicus GLO-30 + GlobalBuildingAtlas fallback is keyless and needs no credential | *(none for the fallback)* | Saudi GEOSA (agreement) |

> **Repo-secret discipline (CI, verbatim).** `terrain-bake.yml` already threads `DATAFORDELER_API_KEY`,
> `LANTMATERIET_API_KEY`, and `MML_API_KEY` as env. Each must exist as a **repository** secret (not
> only a Fly secret) *before* baking that country, or the authenticated fetch fails in CI. Add
> `DGT_CDD_EMAIL`/`DGT_CDD_PASSWORD` the same way when Portugal is wired.

---

## 3 — Keyless — pure engineering, no founder action

These jurisdictions need **no credential and no registration** — only PRYZM engineering (a fetch +
reproject adapter, a derivation step, or a Metalink downloader). No human gate at all.

| Jurisdiction | Terrain | Height | Engineering step |
|---|---|---|---|
| 🇳🇴 **Norway** | NDH (keyless) | derive NDH DOM − DTM | nDSM derivation inside building outlines; do NOT license FKB |
| 🇬🇧 **United Kingdom** | EA/NRW/Scottish/DAERA LiDAR (keyless) | derive EA DSM − DTM + OS Open Buildings/OSM footprints | GBDEM-style extraction; skip OS's commercial attribute |
| 🇩🇪 **Germany — Berlin** | ATKIS DGM 1 m WMS (no auth) | LoD2 CityGML (no auth) | CityGML `measuredHeight` parse — easiest connector in the set |
| 🇩🇪 **Germany — Bavaria (Munich)** | DGM1 Metalink (keyless) | LoD2 CityGML Metalink (keyless) | Metalink-aware bulk downloader (aria2c) + CityGML parse |
| 🇧🇪 **Belgium — Brussels-Capital** | NGI 1 m DTM (keyless) | UrbIS 3D Constructions (keyless) | fetch + WFS parse (CC0) |
| 🇧🇪 **Belgium — Wallonia** | MNT 0.5 m (keyless) | **MNH ready-made height raster** (keyless) | use MNH directly — no subtraction |
| 🇮🇹 **Italy** | Tinitaly 10 m + PST 1 m (keyless) | PST DSM − DTM + regional geoportals | AOI-adaptive source selection; re-check quarterly |
| 🇪🇸 **Spain** | MDT + PNOA-LiDAR (keyless) | **MDS Edificación (MDSnE2.5)** dedicated product (keyless) | direct connector; no subtraction |
| 🇫🇷 **France** | RGE ALTI (keyless) | BD TOPO native `hauteur` (keyless) | already wired; unify terrain + heights |
| 🇺🇸 **United States** | 3DEP (keyless; free OpenTopography key for the API) | Overture Buildings (keyless) | pull latest Overture release; verify AOI completeness |

---

## 4 — Reconciliations (where this map corrects an existing doc)

Recorded so the corrections are explicit and not silent drift:

- **Denmark auth.** This doc names `DATAFORDELER_API_KEY` (founder-verified). A separate finding
  (git `1fc5bc8b`, and `HEIGHTS-COVERAGE-AND-BLOCKED.md`) records that Datafordeler **Basic Auth was
  RETIRED** in 2026 and the 2026 host expects `apikey=` (Matrikel proxy already switched). These are
  consistent — the *credential to store* is `DATAFORDELER_API_KEY`; the *transport* is `apikey=`, not
  Basic Auth. If the apikey path is refused, the service-user (`DATAFORDELER_USERNAME`/`_PASSWORD`) or
  Dataforsyningen token (`DATAFORSYNING_TOKEN`) are the fallbacks. The blocker is the same one action:
  add the key as a **repository** secret.
- **Belgium — Brussels.** `../CONTEXT-TERRAIN-COVERAGE.md` §2.2 lists Brussels as **BLOCKED** and
  carries a founder prompt. **That verdict was a research error.** Brussels-Capital is fully open and
  keyless (NGI 1 m DTM via geo.be + UrbIS via datastore.brussels, CC0). The coverage doc's §2.2 prompt
  is superseded by this row and should be retired on its next edit.
- **Germany — Bavaria.** `HEIGHTS-COVERAGE-AND-BLOCKED.md` lists Bavaria/Munich as **BLOCKED**
  (ZSHH INSPIRE-restricted). Founder verification finds Bavaria DGM1 + LoD2 CityGML **open under
  CC BY 4.0** via geodaten.bayern.de Metalink. This map is authoritative on sourcing: **Bavaria is
  OK (keyless)**; the coverage doc's Bavaria row should be corrected on its next edit.
- **Norway / UK heights.** The coverage docs mark national height *products* as commercial (FKB /
  OS Building Heights). This map's decision is to **DERIVE** heights from the open DSM − DTM instead
  — so both are **OK** without any commercial licence. See ADR-0277 (b).

---

## 5 — The two derivation families (why "no height product" ≠ "no heights")

1. **Ready-made height product / attribute / surface** — France (BD TOPO `hauteur`), Spain
   (MDS Edificación MDSnE2.5), Wallonia (MNH), the German LoD2 Länder (`measuredHeight`), Denmark
   (GeoDanmark), Flanders (3D GRB LoD1), US (Overture). **Use directly; no subtraction.**
2. **DERIVE from DSM − DTM (or an nDSM raster)** — Norway (NDH DOM − DTM), UK (EA DSM − DTM),
   Portugal (MDS − MDT), Italy (PST DSM − DTM). Same nDSM engine everywhere (robust P90/trimmed-median
   inside the eroded footprint — never max), so a country lacking a *height product* is not a gap.

Only **Saudi Arabia** lacks *both* an open DEM and an open height source nationally — the one truly
blocked jurisdiction, with an accepted keyless global fallback (Copernicus GLO-30 + GlobalBuildingAtlas).

---

*Created 2026-07-25 (founder-verified sourcing). Maintainer: UNASSIGNED. This doc is the sourcing
authority; pipeline status lives in the two coverage docs, decisions in ADR-0277, and the aspirational
architecture in the terrain North Star. Amend this file in place — do not fork a `*-AUDIT.md` derivative
(C31 / C00 §"How to amend").*
