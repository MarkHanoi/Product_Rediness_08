# Berlin (11000) — data sources

**Status:** PROBE ATTEMPTED 2026-07-23 — all documented FIS-Broker paths return 404. Endpoints in NEXT.md §6 are stale. FIS-Broker discovery required before any Berlin probe can succeed.

---

## A — VERIFIED (corroborated research leads; not yet live-probed)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| B-Plan coverage (XPlanung) | Berlin FIS-Broker — XPlanung B-Plan polygon layer | Berlin FIS-Broker, Berlin Senatsverwaltung | `fbinter.stadt-berlin.de` | `corroborated` — layer confirmed; field names (GRZ/GFZ/Höhe) not yet probed live |
| Baunutzungsplan 1958/60 | Berlin FIS-Broker — separate digitised legacy layer (predates XPlanung schema) | Baunutzungsplan 1958/60, §173(3) BBauG | `fbinter.stadt-berlin.de` | `corroborated` — layer confirmed as digitised; exact layer name TBD |
| Baunutzungsplan voidance precedent | OVG Berlin-Brandenburg, 15 Sep 2020, Az. 2 B 10.17 — GFZ 1.5 in Neukölln voided as funktionslos | Court ruling | — | `published` — treat any Baunutzungsplan-derived figure as `corroborated, subject to voidance risk`, NOT `published` |
| §34 prevalence — East Berlin | Large parts of former East Berlin districts documented as §34 (no effective pre-1990 plan, no B-Plan since adopted) | Berlin Abgeordnetenhaus parliamentary record | Berlin Abgeordnetenhaus documentation | `published` (fact); fraction not quantified |
| §34 legal standard | "Einfügen in die Eigenart der näheren Umgebung" — no numeric table | BauGB §34 | `gesetze-im-internet.de/bbaug/__34.html` | `published` |
| BauNVO zone taxonomy | §§2–11 BauNVO — national, see `../../sources/SOURCES.md` | BauNVO | `gesetze-im-internet.de/baunutzungsv/` | `published` |
| §17 density ceilings | Table in `../../README.md §1.3` | BauNVO §17 | `gesetze-im-internet.de/baunutzungsv/__17.html` | `published` |
| LoD2 Berlin | Berlin FIS-Broker LoD2-DE CityGML layer — open access (GDI-BE) | GDI-BE open data programme | `fbinter.stadt-berlin.de` | `corroborated` — open access confirmed; exact layer name and field schema TBD |
| Erhaltungsverordnung (conservation areas) | Administered per district authority; existence in Berlin confirmed | Erhaltungsverordnung per district | Berlin district authorities | `published` (existence); layer name and machine-readability TBD |

---

## B — UNVERIFIED (needed before any numeric rule may ship)

| Field | What to verify against | Method |
|---|---|---|
| **Berlin FIS-Broker endpoint discovery — 2026-07-23 probe results** | All documented FIS-Broker WFS paths returned **HTTP 404**: `fbinter.stadt-berlin.de/fb/wfs/geometry/senstadt/re_bplan`, `fbinter.stadt-berlin.de/fb/wfs/data/senstadt/s_bplan`, `fbinter.stadt-berlin.de/fb/wfs/geometry/senstadt/re_3dgebaeude`, `fbinter.stadt-berlin.de/fb/wfs/data/senstadt/s_wfs_alkis_gebaeudeflaechen`, `gdi.berlin.de/services/wfs/be_bplan`, `gdi.berlin.de/services/wfs/be_xplanung`, `gdi.berlin.de/services/wfs/s_bplan`. FIS-Broker index page `fbinter.stadt-berlin.de/fb/` also returned 404. `fbinter.stadt-berlin.de/fb/index.jsp` returned no WFS links. **All FIS-Broker paths documented before 2026-07-23 are stale.** | 2026-07-23 live probes | `fbinter.stadt-berlin.de` and `gdi.berlin.de` | `verified (negative)` — endpoint rediscovery required |
| **Berlin FIS-Broker B-Plan layer name** | Live WFS GetCapabilities response — **BLOCKED: endpoint rediscovery required first** | Find current FIS-Broker endpoint (see `../NEXT.md §7 DEAD ENDS`) |
| **GRZ / GFZ / Höhe attributes in Berlin B-Plan XPlanGML** | Live GetFeature response for a Mitte parcel — **BLOCKED: endpoint rediscovery required first** | Run probe B1 after endpoint discovery; check attribute names and null rate |
| **Berlin FIS-Broker Baunutzungsplan layer name** | WFS GetCapabilities — search for Baunutzungsplan / baunp / bnp — **BLOCKED: endpoint rediscovery required first** | Same probe session as B1 |
| **Baustufen → GRZ/GFZ translation table** | Original 1958/60 Baunutzungsplan legend/key | Berlin Senate Stadtentwicklungsamt archive — see `../NEXT.md §3.B2` |
| **§34 coverage fraction — East Berlin** | Grid-sample probe over former East Berlin districts | See `../NEXT.md §3.B4` |
| **BauO Bln §6 — Abstandsflächen multiplier** | BauO Bln primary text §6 | `gesetze.berlin.de` → BauO Bln §6 |
| **Baunutzungsplan voidance status per area** | Manual OVG/BVerwG case-law search per target area | No database exists; case-by-case research required before using any Baunutzungsplan-derived value |
| **Erhaltungsverordnung unified GIS layer** | Berlin Senate or district authority portal | Search FIS-Broker and `daten.berlin.de` for "Erhaltungsverordnung" WFS layer |
| **Any specific GRZ/GFZ/height value for any Berlin B-Plan zone** | XPlanGML response + signed Satzung cross-check | From B1 probe |

---

⚠ **Baunutzungsplan-derived values must never be shipped as `published`.** The OVG 2020 ruling establishes that these figures may be void in individual areas without any database tracking which ones. Every Baunutzungsplan row in this table must carry the caveat: *"corroborated, subject to judicial voidance risk (OVG Berlin-Brandenburg, Az. 2 B 10.17, 15 Sep 2020) — verify case law per area before use."*
