# SOURCES — Sweden national zoning (PBL / NGP / Lantmäteriet)

> Per-field citation catalogue for the SE structured-zoning path.
> THE TRUST GATE (playbook §3.3, C58 §1.6, L-449). A field with NO citable source stays `null` in
> the pack and is listed under §B Unverified. Never interpolate, average, or infer a legal number.

**Status:** PARTIAL — RAÄ WMS endpoint VERIFIED-LIVE (2026-07-24). NGP STAC/OAPIF URL confirmed
from API docs but geo-blocked from non-Swedish IPs. Boverket Planbestämmelsekatalog API confirmed
open from published terms. All other fields at `published`/`stated` confidence.

---

## The sources

| | |
|---|---|
| **Primary planning statute** | Plan- och bygglagen (2010:900) [PBL] — the single national planning law |
| **Digital plan mandate** | Boverkets föreskrifter BFS 2020:5 — mandates digital format for new/amended detaljplaner from 2022-01-01 |
| **Zoning platform** | NGP — Nationella geodataplattformen, operated by Lantmäteriet |
| **Provision semantics** | Planbestämmelsekatalog (Boverket) — ~3,700 codes; API: XML, JSON, Excel |
| **Cadastre** | Lantmäteriet — national sole authority; CC0 licence; account/scope-selection gate for some products |
| **Terrain** | Lantmäteriet national LiDAR, 2009–2019, free download |
| **Heritage** | Riksantikvarieämbetet (RAÄ) Öppna-dataportal; CC0 for some datasets |
| **Comprehensive plan** | Boverket ÖP-katalogen API |
| **Native CRS** | SWEREF99TM (EPSG:3006) — Sweden's national metric projection (Lantmäteriet standard) |

---

## A — VERIFIED (per-field citations from published primary sources)

| Field (pack key) | Value | Unit | Governing article | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| Planning law | PBL (Plan- och bygglagen 2010:900) | statute | PBL cap. 1–16 | Plan- och bygglagen (2010:900), SFS | `https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/plan-och-bygglagen-2010900_sfs-2010-900/` | `published` |
| Digital plan mandate date | 2022-01-01 | date | BFS 2020:5 §2 | Boverkets föreskrifter om detaljplan (BFS 2020:5) | `https://www.boverket.se/bfs` | `published` |
| Municipal planning monopoly | *planmonopol* — 290 kommuner | — | PBL kap. 1 §2 | PBL (2010:900) | see above | `published` |
| NGP operator | Lantmäteriet | — | Government mandate | Lantmäteriet product pages | `https://www.lantmateriet.se` | `published` |
| NGP municipal participation | 284 of 290 signed; 236 of 290 (≈81%) actively delivering | municipalities | — | April 2025 NGP conference presentation; growth confirmed Feb 2026 | not live-probed — conference citation | `stated` |
| Planbestämmelsekatalog codes | ~3,700 provision codes | codes | BFS 2020:5 + Boverket implementing rules | Boverket Planbestämmelsekatalog | `https://www.boverket.se/planbestammelsekatalog` | `published` |
| Cadastre licence | CC0 (most Lantmäteriet open-data products) | — | Swedish Open Data / PSI implementation | Lantmäteriet open data terms | `https://www.lantmateriet.se/geodata` | `published` |
| Terrain coverage | Complete — national LiDAR 2009–2019 | — | — | Lantmäteriet product specification | `https://www.lantmateriet.se` | `published` |
| Terrain density | 0.5–1 pts/m² (0.25 pts/m² alpine) | pts/m² | — | Lantmäteriet product specification | see above | `published` |
| Heritage source | RAÄ Öppna-dataportal; CC0 for ancient monuments, buildings, commissions | — | — | RAÄ open data programme | `https://www.raa.se/hitta-information/oppna-data/` | `published` |
| Heritage NGP integration | Underway from autumn 2022 — ancient monuments + national-interest cultural-heritage areas joining NGP | — | Government tasking | RAÄ / Lantmäteriet joint programme announcement | not live-probed | `published` |
| Stockholm LOD2 status | Fee-based — priced per Stockholm city planning dept. fee schedule | — | — | Stockholm's own city geodata portal fee schedule | not live-probed for current price | `stated` |
| Vadstena NGP delivery | First municipality in Östergötland to publish via NGP: 2026-02-18 | date | — | Municipal announcement / NGP producer list | not live-probed | `stated` |

---

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it (the exact source to read) |
|---|---|---|
| NGP WFS endpoint URL | Not fetched — no GetCapabilities has been run | Fetch `https://www.lantmateriet.se/en/geodata/` or search "NGP WFS detaljplan"; run `GetCapabilities` |
| NGP feature type names + field names | Depends on live endpoint | `DescribeFeatureType` after endpoint confirmed |
| Provision code → numeric attribute mapping | Boverket API base URL not resolved from non-SE origin (Azure APIM SPA; exact path unknown) | Load `api-portal.boverket.se` SPA in browser from Swedish IP; find `bestammelser` endpoint; fetch one record |
| NGP STAC item field names | Geo-blocked from non-SE IPs (HTTP 403 "Geolocation Block!" confirmed 2026-07-24) | Route via Swedish IP; OAuth2 token from `apimanager.lantmateriet.se`; `GET .../collections/{id}/items?limit=1`; inspect `properties` |
| Land-area fill rate (post-2022 plans / total zoned area) | No probe executed — geo-blocked | Run Monte-Carlo point sample against NGP STAC via Swedish IP for Gothenburg (see NEXT.md §3.2) |
| ÖP-katalogen field coverage | API not fetched | Fetch Boverket ÖP-katalogen API endpoint; check `maxHeight`, `maxFloors`, `permittedUse` equivalent fields |
| Lantmäteriet "akt" access status | Live restriction as of research date; may have changed | GET `https://www.lantmateriet.se` and search for akt/informationssäkerhet news |
| LOD2 status for Gothenburg / Malmö | Not checked per city | Check `goteborg.se/geodata` and Malmö geodata portal for 3D building model downloads |
| Planbestämmelsekatalog adoption rate in practice | Unknown — 3,700 codes exist; unclear what % of real plans use structured codes vs. free-text | Sample 10–20 NGP-delivered STAC items and inspect provision-code field completeness |

⚠ A number that appears only in a conference presentation, slide, or secondary republication is
`stated` — record it here as a research note, never promote it to §A without a primary-source citation.
