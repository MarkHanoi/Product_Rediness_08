# Munich / München (09162) — data sources

**Status:** NOT STARTED — no live probe run, no field values confirmed.

---

## A — VERIFIED (corroborated research leads; not yet live-probed)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| B-Plan coverage (XPlanung, interim) | Munich / Bavarian XPlanung WFS — **endpoint discovery BLOCKED 2026-07-23**: all tried paths returned 404 or connection refused: `geoportal.muenchen.de/geoserver/wfs` (404), `geoportal.muenchen.de/geoserver/opendata/wfs` (404), `stadtplan.muenchen.de/stadtplan/ows` (000 — connection refused), `geoservices.bayern.de/wfs/bplan` (404), `geoservices.bayern.de/wms/v2/ogc_bplan` (no WFS in response), Munich opendata.muenchen.de CKAN (1 result, CSW metadata only, no WFS). BayernAtlas main page HTTP 200 but no WFS URL found. | Live probe 2026-07-23 | `geoportal.muenchen.de` / `stadtplan.muenchen.de` / `geoservices.bayern.de` | `verified (negative)` — endpoint rediscovery required; try `mapserver.gis.muenchen.de` or `geoportal.bayern.de/bayernatlas` WFS |
| B-Plan coverage (DiPlanung) | DiPlanung mandatory Bavarian statewide from 31 October 2026. **Already operationally live in Bayern as of 2026-07-23** (along with Berlin, Brandenburg, Bremen, Hamburg, Niedersachsen, Schleswig-Holstein). See `../../sources/SOURCES.md`. | Bavarian state mandate + DiPlanung operational status 2026-07-23 | `diplanung.de` | `published` (mandate); `corroborated` (already operational) |
| BauNVO zone taxonomy | §§2–11 BauNVO (national) — see `../../sources/SOURCES.md` | BauNVO | `gesetze-im-internet.de/baunutzungsv/` | `published` |
| §17 density ceilings | Table in `../../README.md §1.3` | BauNVO §17 | `gesetze-im-internet.de/baunutzungsv/__17.html` | `published` |
| Regime taxonomy (§30/§34/§35) | See `../../sources/SOURCES.md` | BauGB §§30/34/35 | `gesetze-im-internet.de/bbaug/` | `published` |
| LoD2-DE source (Bavaria) | ZSHH hosted at Bayerische Vermessungsverwaltung — CityGML LoD2 tiles | ZSHH / AdV | `geodaten.bayern.de` | `corroborated` (ZSHH hosting confirmed); licence and open-access status NOT YET confirmed |

---

## B — UNVERIFIED (needed before any numeric rule may ship)

| Field | What to verify against | Method |
|---|---|---|
| **Munich/Bavarian XPlanung WFS endpoint URL** | Live WFS GetCapabilities response | Run B1 probe in `../NEXT.md §3` |
| **GRZ / GFZ / Höhe attributes in Munich XPlanGML** | Live GetFeature response for a Munich parcel | Run probe after endpoint confirmed (see B1 command in NEXT.md) |
| **§34 coverage fraction for Munich** | Grid-sample probe over Munich bbox | See `../NEXT.md §3.B1` — run first |
| **DiPlanung WFS endpoint** | DiPlanung API documentation | `diplanung.de` — API docs section |
| **Bavarian LoD2 licence terms** | Bayerische Vermessungsverwaltung product page | `geodaten.bayern.de` → LoD2 product → licence tab |
| ~~**BayBO Art. 6 Abstandsflächen multiplier**~~ | **RESOLVED 2026-07-23** — BayBO Art. 6 full text extracted. See `../../sources/SOURCES.md` for the formula (0.4H general, 0.2H in GE/GI, min 3m). Promoted to `../../sources/SOURCES.md §A`. | DONE |
| **Baunutzungsplan-equivalent legacy layer for Munich** | Munich / Bavarian geoportal historical layers | Check geoportal for plan types predating BauNVO (pre-1962) |
| **Any specific GRZ/GFZ/height value for any Munich B-Plan zone** | Live XPlanGML response or signed Satzung PDF | From XPlanGML probe + Satzung cross-check |

---

⚠ No numeric GRZ, GFZ, or height value has been verified from a primary source for any Munich B-Plan zone.
