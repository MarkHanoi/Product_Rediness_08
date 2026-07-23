# Berlin (11000) — data sources

**Status:** PROBED 2026-07-23 (two sessions) — FIS-Broker `/fb/` paths all 404 (stale). **NEW 2026-07-23: Berlin B-Plan WFS discovered at `gdi.berlin.de/services/wfs/bplan` — HTTP 200, open (DL-DE Zero 2.0).** Critical negative: schema has plan boundaries + PDF links only — NO GRZ/GFZ/Höhe. Same situation as Hamburg. PDF transcription required.

---

## A — VERIFIED (corroborated research leads; not yet live-probed)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| **Berlin B-Plan WFS — LIVE PROBE 2026-07-23** | `https://gdi.berlin.de/services/wfs/bplan?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities` — **HTTP 200**. Title: "Bebauungsplanverfahren in Berlin". Licence: **Datenlizenz Deutschland - Zero - Version 2.0** (completely free, no restrictions). Three feature types: `bplan:b_bp_fs` (festgesetzt), `bplan:a_bp_iv` (im Verfahren), `bplan:c_bp_ak` (außer Kraft gesetzt). GetFeature with `?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=bplan:b_bp_fs&BBOX=...&OUTPUTFORMAT=application/json` returns JSON. | GDI-BE open data | `gdi.berlin.de/services/wfs/bplan` | `verified` — HTTP 200, full WFS 2.0.0 GetCapabilities received 2026-07-23 |
| **Berlin bplan:b_bp_fs schema — CRITICAL NEGATIVE** | Schema (31 fields): `gisid`, `planid`, `planname`, `planartname` ("Qualifizierter B-Plan" / "Einfacher B-Plan" / "Vorhabenbezogener B-Plan"), `verfahrensart`, `bereich` (text description of area), `bezirk` (district), `bp_rechtsstand` ("In Kraft getreten"), `afs_behoer`, `afs_beschl`, `afs_l_aend`, `bbg_anfang`, `bbg_ende`, `aul_anfang`, `aul_ende`, `festsg_von`, `festsg_am`, `fsg_gvbl_n`, `fsg_gvbl_s`, `fsg_gvbl_d`, `normkontr`, **`scan_www`** (PDF URL: `https://mitte.gis-broker.de/bplaene/<planid>.pdf`), `grund_www`, `url_www`, **`inhalt`** (zone type summary text), `ersetztteil`, `ersetztvoll`, `ersetztdurchteil`, `ersetztdurchvoll`. **NO GRZ, NO GFZ, NO Höhe attributes.** Like Hamburg: plan boundary polygon + PDF link only. **Berlin also requires PDF transcription.** 89 plans in Mitte bbox alone (3 returned in GetFeature sample). | Live probe 2026-07-23 — BBOX 13.38,52.51,13.41,52.535 EPSG:4326 | `gdi.berlin.de/services/wfs/bplan?...&TYPENAMES=bplan:b_bp_fs` | `verified (negative)` — **GRZ/GFZ/Höhe absent from WFS schema; PDF transcription required** |
| Baunutzungsplan 1958/60 | FIS-Broker digitised legacy layer — exact WFS path still unknown (`fbinter.stadt-berlin.de/fb/` paths all 404). `gdi.berlin.de/services/wfs/bplan` covers only XPlanung-era plans; Baunutzungsplan not in this WFS. | Baunutzungsplan 1958/60, §173(3) BBauG | `fbinter.stadt-berlin.de` (to be rediscovered) or `gdi.berlin.de` | `corroborated` — existence confirmed; endpoint TBD |
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
| ~~**Berlin FIS-Broker endpoint discovery**~~ | **RESOLVED 2026-07-23** — B-Plan WFS found at `gdi.berlin.de/services/wfs/bplan`. All `/fb/wfs/...` paths are stale. `gdi.berlin.de/services/wfs/be_xplanung` — still 404 (use `bplan` service). FIS-Broker root alive (HTTP 200, thin landing page). | DONE |
| ~~**Berlin B-Plan WFS layer name**~~ | **RESOLVED 2026-07-23** — `bplan:b_bp_fs` (festgesetzt), `bplan:a_bp_iv` (im Verfahren), `bplan:c_bp_ak` (außer Kraft gesetzt). See §A above. | DONE |
| ~~**GRZ / GFZ / Höhe attributes in Berlin B-Plan**~~ | **RESOLVED 2026-07-23 — ABSENT** — schema confirmed: plan boundary polygon + `scan_www` PDF link + `inhalt` text only. PDF transcription required — same situation as Hamburg. | DONE |
| **Berlin Baunutzungsplan WFS layer** | Baunutzungsplan 1958/60 not present in `gdi.berlin.de/services/wfs/bplan`. Digitised FIS-Broker layer still at unknown endpoint. | Search `gdi.berlin.de` services listing or check `daten.berlin.de` for Baunutzungsplan WFS |
| **Baustufen → GRZ/GFZ translation table** | Original 1958/60 Baunutzungsplan legend/key | Berlin Senate Stadtentwicklungsamt archive — see `../NEXT.md §3.B2` |
| **§34 coverage fraction — East Berlin** | Grid-sample probe over former East Berlin districts | See `../NEXT.md §3.B4` |
| **BauO Bln §6 — Abstandsflächen multiplier** | BauO Bln primary text §6 | `gesetze.berlin.de` → BauO Bln §6 |
| **Baunutzungsplan voidance status per area** | Manual OVG/BVerwG case-law search per target area | No database exists; case-by-case research required before using any Baunutzungsplan-derived value |
| **Erhaltungsverordnung unified GIS layer** | Berlin Senate or district authority portal | Search FIS-Broker and `daten.berlin.de` for "Erhaltungsverordnung" WFS layer |
| **Any specific GRZ/GFZ/height value for any Berlin B-Plan zone** | XPlanGML response + signed Satzung cross-check | From B1 probe |

---

⚠ **Baunutzungsplan-derived values must never be shipped as `published`.** The OVG 2020 ruling establishes that these figures may be void in individual areas without any database tracking which ones. Every Baunutzungsplan row in this table must carry the caveat: *"corroborated, subject to judicial voidance risk (OVG Berlin-Brandenburg, Az. 2 B 10.17, 15 Sep 2020) — verify case law per area before use."*
