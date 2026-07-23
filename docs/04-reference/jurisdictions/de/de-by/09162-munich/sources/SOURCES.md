# Munich / München (09162) — data sources

**Status:** NOT STARTED — no live probe run, no field values confirmed.

---

## A — VERIFIED (corroborated research leads; not yet live-probed)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| B-Plan coverage (XPlanung, interim) | Munich / Bavarian XPlanung WFS — endpoint to be confirmed in probe | BauGB / Bavarian XPlanung programme | `stadtplan.muenchen.de` or `geoportal.bayern.de` | `corroborated` — service exists; endpoint URL needs live probe |
| B-Plan coverage (DiPlanung, from Oct 2026) | DiPlanung — mandatory Bavarian statewide XPlanung delivery | Bavarian state mandate | `diplanung.de` | `published` (mandate); endpoint TBD |
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
| **BayBO Art. 6 Abstandsflächen multiplier** | BayBO primary text Art. 6 | `gesetze-bayern.de/Content/Document/BayBO-6` |
| **Baunutzungsplan-equivalent legacy layer for Munich** | Munich / Bavarian geoportal historical layers | Check geoportal for plan types predating BauNVO (pre-1962) |
| **Any specific GRZ/GFZ/height value for any Munich B-Plan zone** | Live XPlanGML response or signed Satzung PDF | From XPlanGML probe + Satzung cross-check |

---

⚠ No numeric GRZ, GFZ, or height value has been verified from a primary source for any Munich B-Plan zone.
