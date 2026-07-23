# Hamburg (02000) — data sources

**Status:** PROBED 2026-07-23 — WFS live-probed. **CRITICAL NEGATIVE FINDING: the Hamburg XPlanung WFS exposes only plan boundary polygons + PDF links — NO GRZ/GFZ/Höhe attributes.** This resolves B1 negatively: Hamburg packs require PDF transcription, not WFS attribute ingestion. Estimate raised from ~10–12 to ~18–20 dev-days.

---

## A — VERIFIED (corroborated research leads; not yet live-probed)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| Parcel standard | ALKIS `Flurstück` — Hamburg LGV / Transparenzportal | Hamburg LGV (GDI-HH) | `transparenzportal.hamburg.de` or `geodienste.hamburg.de` | `corroborated` — endpoint lead confirmed; auth terms not yet probed |
| **Hamburg XPlanung WFS — LIVE PROBE 2026-07-23** | `geodienste.hamburg.de/HH_WFS_Bebauungsplaene` — HTTP 200. WFS 2.0.0. Licence: **Datenlizenz Deutschland Namensnennung 2.0, Quellenvermerk: Freie und Hansestadt Hamburg, Behörde für Stadtentwicklung und Wohnen**. Access constraints: **"Es gelten keine Zugriffsbeschränkungen"** (no access restrictions). Provider: LGV Hamburg. Contact: `udp-hilfe@gv.hamburg.de` | Hamburg LGV, Behörde für Stadtentwicklung und Wohnen | `geodienste.hamburg.de/HH_WFS_Bebauungsplaene` | `verified` — live HTTP 200, licence and access terms confirmed |
| **Hamburg WFS feature types** | Two types confirmed: (1) `app:hh_hh_festgestellt` — finalized/festgestellt B-Plans; (2) `app:prosin_imverfahren` — plans in-progress (Planverfahren) | Live DescribeFeatureType 2026-07-23 | `geodienste.hamburg.de/HH_WFS_Bebauungsplaene?REQUEST=DescribeFeatureType` | `verified` |
| **`app:hh_hh_festgestellt` schema — CRITICAL NEGATIVE** | Schema: `geltendes_planrecht` (plan ID, e.g. "TB3"), `planrecht` (PDF URL, e.g. `https://daten-hamburg.de/infrastruktur_bauen_wohnen/bebauungsplaene/pdfs/bplan/TB3.pdf`), `begruendung` (Begründung — empty in sample), `feststellungsdatum` (date, e.g. "11.10.1949"), `geom` (MultiSurface). **NO GRZ, NO GFZ, NO Höhe, NO XPlanGML attributes.** The WFS exposes only plan boundary polygon + PDF link. | Live GetFeature 2026-07-23 — BBOX 9.9920,53.5490,9.9980,53.5530 EPSG:4326 COUNT=2 | `geodienste.hamburg.de/HH_WFS_Bebauungsplaene?TYPENAMES=app:hh_hh_festgestellt` | `verified (negative)` — **RESOLVES B1 NEGATIVELY: GRZ/GFZ/Höhe are NOT machine-readable via WFS. Hamburg packs require PDF transcription.** |
| **`app:prosin_imverfahren` schema** | Schema: `feststellung`, `plan`, `hotlink_iv`, `the_geom` | Live DescribeFeatureType 2026-07-23 | Same endpoint | `verified` — in-progress plans layer confirmed; also PDF-link-only |
| **Hamburg B-Plan PDF access** | `planrecht` field contains direct URL to PDF: `https://daten-hamburg.de/infrastruktur_bauen_wohnen/bebauungsplaene/pdfs/bplan/<planID>.pdf` — HTTP 200, content-type: application/pdf, size: 581,327 bytes (TB3.pdf sample) | Live HEAD probe 2026-07-23 | `daten-hamburg.de/infrastruktur_bauen_wohnen/bebauungsplaene/pdfs/bplan/TB3.pdf` | `verified` — PDF download path confirmed and functional |
| B-Plan coverage (XPlanung) | Hamburg XPlanung WFS — 1,900 BauGB + 900 pre-1960 plans, fully migrated 2018 | Hamburg LGV / XLeitstelle | `geodienste.hamburg.de/HH_WFS_Bebauungsplaene` | `corroborated` — migration completion confirmed from XLeitstelle documentation |
| BauNVO zone taxonomy | §§2–11 BauNVO (national) — see `../../sources/SOURCES.md` | BauNVO | `gesetze-im-internet.de/baunutzungsv/` | `published` |
| §17 density ceilings | Table in `../../README.md §1.3` — see `../../sources/SOURCES.md` | BauNVO §17 | `gesetze-im-internet.de/baunutzungsv/__17.html` | `published` |
| Regime taxonomy (§30/§34/§35) | See `../../sources/SOURCES.md` | BauGB §§30/34/35 | `gesetze-im-internet.de/bbaug/` | `published` |
| Building footprints + height | LoD2-DE via Hamburg LGV or Transparenzportal — CityGML | Hamburg LGV | `transparenzportal.hamburg.de` | `corroborated` — endpoint lead; licence and field presence not yet confirmed |

---

## B — UNVERIFIED (needed before any numeric rule may ship)

| Field | What to verify against | Method |
|---|---|---|
| ~~**GRZ / GFZ / Height attributes in Hamburg XPlanGML**~~ | **RESOLVED 2026-07-23 — CONFIRMED ABSENT** from the public WFS. The `app:hh_hh_festgestellt` schema has no GRZ/GFZ/Höhe fields — only plan ID, PDF URL, and geometry. This is a definitive negative: Hamburg packs must use PDF transcription. | ~~Run probe~~ — DONE; result in §A |
| **Pre-1960 Hamburg-law plan citation preservation** | For a pre-1960 plan: open PDF from `planrecht` field; check whether the PDF preserves the original Hamburg-law citation (needed for signature gate) | Download PDF for a plan with `feststellungsdatum` before 1960; read legal citation on cover page |
| **ALKIS WFS — Hamburg** | `geodienste.hamburg.de/HH_WFS_ALKIS` — **confirmed HTTP 404** (2026-07-23 live probe). Path has changed or service discontinued at this URL. | Live probe 2026-07-23 | `geodienste.hamburg.de/HH_WFS_ALKIS` | `verified (negative)` — 404 confirmed; use `transparenzportal.hamburg.de` CKAN or `geodienste.hamburg.de` capabilities listing to find current ALKIS endpoint |
| **HBauO §6 — Abstandsflächen multiplier** | `landesrecht-hamburg.de/bsha` is a JavaScript SPA — §6 text not accessible via curl (returns 5,634 chars JS bundle, no article content). Headless browser or PDF print required. | Live probe 2026-07-23 | `landesrecht-hamburg.de/bsha/document/jlr-BauOHA2018pP6` | `verified (negative)` — content not accessible via curl |
| **§34 coverage fraction** | Grid-sample probe over Hamburg bbox | See `../NEXT.md §3.B4` |
| **Any specific GRZ/GFZ/height value for any Hamburg B-Plan zone** | Live XPlanGML response or signed Satzung PDF | From B1 probe + Satzung cross-check |

---

⚠ No numeric GRZ, GFZ, or height value has been verified from a primary source for any Hamburg B-Plan zone. §17 BauNVO ceilings are confirmed as the national upper bound only — never a default for any specific parcel.
