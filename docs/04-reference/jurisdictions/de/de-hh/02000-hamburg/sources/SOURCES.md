# Hamburg (02000) — data sources

**Status:** NOT STARTED — no live probe run, no field values confirmed.

---

## A — VERIFIED (corroborated research leads; not yet live-probed)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| Parcel standard | ALKIS `Flurstück` — Hamburg LGV / Transparenzportal | Hamburg LGV (GDI-HH) | `transparenzportal.hamburg.de` or `geodienste.hamburg.de` | `corroborated` — endpoint lead confirmed; auth terms not yet probed |
| B-Plan coverage (XPlanung) | Hamburg XPlanung WFS — 1,900 BauGB + 900 pre-1960 plans, fully migrated 2018 | Hamburg LGV / XLeitstelle | `geodienste.hamburg.de/HH_WFS_Bebauungsplaene` | `corroborated` — migration completion confirmed from XLeitstelle documentation |
| BauNVO zone taxonomy | §§2–11 BauNVO (national) — see `../../sources/SOURCES.md` | BauNVO | `gesetze-im-internet.de/baunutzungsv/` | `published` |
| §17 density ceilings | Table in `../../README.md §1.3` — see `../../sources/SOURCES.md` | BauNVO §17 | `gesetze-im-internet.de/baunutzungsv/__17.html` | `published` |
| Regime taxonomy (§30/§34/§35) | See `../../sources/SOURCES.md` | BauGB §§30/34/35 | `gesetze-im-internet.de/bbaug/` | `published` |
| Building footprints + height | LoD2-DE via Hamburg LGV or Transparenzportal — CityGML | Hamburg LGV | `transparenzportal.hamburg.de` | `corroborated` — endpoint lead; licence and field presence not yet confirmed |

---

## B — UNVERIFIED (needed before any numeric rule may ship)

| Field | What to verify against | Method |
|---|---|---|
| **GRZ attribute in Hamburg XPlanGML** | Live WFS GetFeature response | Run probe in `../NEXT.md §3.B1` — **highest priority** |
| **GFZ attribute in Hamburg XPlanGML** | Live WFS GetFeature response | Same probe |
| **Height attribute name(s) in Hamburg XPlanGML** (`hoeheMN` / `hoeheBezugspunkt` / `GeschosseMax`) | Live WFS GetFeature response | Same probe; record which attribute is populated and with what values |
| **Pre-1960 Hamburg-law plan citation preservation** | XPlanGML `rechtsstand` / `texte` attributes for a pre-1960 plan | After B1 probe: fetch a pre-1960 plan GML file; read `rechtsstand` field |
| **ALKIS WFS authentication terms (Hamburg)** | HTTP response headers for the Hamburg ALKIS WFS | `curl "https://geodienste.hamburg.de/HH_WFS_ALKIS?SERVICE=WFS&REQUEST=GetCapabilities"` |
| **HBauO §6 — Abstandsflächen multiplier** | HBauO primary text §6 | `landesrecht-hamburg.de/bsha` → HBauO §6 |
| **§34 coverage fraction** | Grid-sample probe over Hamburg bbox | See `../NEXT.md §3.B4` |
| **Any specific GRZ/GFZ/height value for any Hamburg B-Plan zone** | Live XPlanGML response or signed Satzung PDF | From B1 probe + Satzung cross-check |

---

⚠ No numeric GRZ, GFZ, or height value has been verified from a primary source for any Hamburg B-Plan zone. §17 BauNVO ceilings are confirmed as the national upper bound only — never a default for any specific parcel.
