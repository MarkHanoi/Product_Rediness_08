# Germany (`de`) — national data sources

**Status:** PARTIALLY PROBED 2026-07-23 — Hamburg WFS live-probed (open, Datenlizenz Deutschland 2.0); Berlin FIS-Broker paths stale (all 404). No numeric rule values are verified — those live in per-parcel B-Plan XPlanGML files or signed Satzung PDFs, neither of which has been read for any specific German parcel.

> **Trust gate:** a field with NO citable source stays `null` in the pack and is listed under §B.
> A pack may not ship confidence `structured` unless EVERY field it sets has a row in §A here.

---

## A — VERIFIED (research-cited; not yet live-probed)

| Field (pack key / layer) | Value / endpoint | Unit | Governing instrument | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| Parcel geometry standard | ALKIS (Amtliches Liegenschaftskatasterinformationssystem), AAA-Modell, `Flurstück` object | — | AdV (Arbeitsgemeinschaft der Vermessungsverwaltungen) | "AAA-Modell — Objektartenkatalog ALKIS", AdV, current | `adv-online.de` | `published` |
| ALKIS access model | Per-Land WFS/geoportal; schema standardised, licences vary (some free: NRW, GDI-BE; others fee-based) | — | Per-Land Vermessungsbehörde decisions | Research finding, multiple corroborating sources | — | `corroborated` |
| Zone taxonomy | BauNVO §§2–11 — fixed closed national list: WS, WR, WA, WB, MD, MU, MI, MK, GE, GI, SO | — | Baunutzungsverordnung (BauNVO), federal ordinance | BauNVO (current consolidated), BMWSB | `gesetze-im-internet.de/baunutzungsv/` | `published` |
| §17 density ceilings (GRZ/GFZ per zone type) | See `README.md §1.3` — e.g. WA: GRZ 0.40 / GFZ 1.20; MK: GRZ 1.00 / GFZ 3.00 | ratio | BauNVO §17 | BauNVO §17 (current), BMWSB | `gesetze-im-internet.de/baunutzungsv/__17.html` | `published` |
| §17 ceiling rule | §17 figures are CEILINGS; a B-Plan may set lower values; may only be exceeded via formal §17(2) derogation | — | BauNVO §17 Abs. 2 | BauNVO §17 | `gesetze-im-internet.de` | `published` |
| GFZ calculation method | §20 BauNVO — Geschossfläche = sum of floor areas of all Vollgeschosse above terrain | m²/m² | BauNVO §20 | BauNVO §20 (current) | `gesetze-im-internet.de/baunutzungsv/__20.html` | `published` |
| Regime taxonomy (§30/§34/§35) | §30: inside B-Plan; §34: unplanned interior (Einfügen); §35: outlying area (presumptively not buildable) | — | BauGB §§30, 34, 35 | Baugesetzbuch (BauGB), current consolidated | `gesetze-im-internet.de/bbaug/` | `published` |
| §34 legal standard | "Einfügen in die Eigenart der näheren Umgebung" — fit the character of the surrounding area; discretionary; NO numeric table | — | BauGB §34 Abs. 1 | BauGB §34 | `gesetze-im-internet.de/bbaug/__34.html` | `published` |
| XPlanung standard | XPlanung schema (v6.1 current), exchange format XPlanGML; IT-Planungsrat resolution mandatory 2017, transition closed Feb 2023 | — | IT-Planungsrat resolution 2017-10-05 | "XPlanung — Spezifikation", XLeitstelle Hamburg LGV | `xleitstelle.de` | `published` |
| XPlanung adoption — Hamburg | 1,900 B-Pläne under federal law + 900 pre-1960 plans under Hamburg-own law; fully migrated 2018 (started 2011) | — | Hamburg LGV / XLeitstelle documentation | Hamburg XPlanung migration project documentation | `xleitstelle.de` | `published` |
| XLeitstelle location | National XPlanung coordination office hosted at Hamburg LGV | — | — | Hamburg LGV institutional record | — | `published` |
| XPlanung adoption — Bavaria | DiPlanung mandatory statewide from 31 October 2026 (Bavarian formal mandate). **Already operationally live in 7 Länder as of 2026-07-23: Bayern, Berlin, Brandenburg, Bremen, Hamburg, Niedersachsen, Schleswig-Holstein.** Fachliche Leitstelle DiPlanung hosted at Hamburg BSW. DiPlanPortal is the federal research platform for Planwerke. Interfaces: XPlanverfahren and XBeteiligung standards. API endpoint URL at `diplanung.de/schnittstellen` — not yet fetched. | Bavarian state mandate; DiPlanung operational status confirmed 2026-07-23 | `diplanung.de` | `published` (mandate); `corroborated` (operational status) |
| LoD2-DE coverage | ~58 million buildings nationwide; CityGML; ALKIS footprint + LiDAR-derived; ~1 m height accuracy | count; m | ZSHH (Zentrale Stelle für Hauskoordinaten und Hausumringe) | ZSHH LoD2-DE product documentation | `hauskoordinaten.de` | `published` |
| LoD2-DE national access | INSPIRE Art. 13(1)(e) — restricted to "limited group of authorised users" | — | INSPIRE Directive Art. 13 | EU INSPIRE Directive Art. 13(1)(e) | `inspire.ec.europa.eu` | `published` |
| LoD2-DE per-Land open tiles | Confirmed free direct download: Sachsen-Anhalt, Baden-Württemberg; Berlin via FIS-Broker | — | Per-Land geodata portal decisions | Research finding | — | `corroborated` |
| Abstandsflächen concept | Height-proportional setback from boundary; multiplier/minimum is per-Land Landesbauordnung | — | 16 Landesbauordnungen | Each Land's LBO (16 separate sources) | Per-Land government portals | `published` (concept); per-Land (values) |
| **BayBO Art. 6 Abstandsflächen — FULL TEXT 2026-07-23** | Art. 6(4): H = wall height from terrain to wall/roof junction; roof ≤70° pitch adds H/3 to H; >70° pitch adds full H. Art. 6(5): **setback = 0.4H** (general); **0.2H in Gewerbe- und Industriegebieten** (GE/GI zones); minimum **3 m** in all cases. Städtebauliche Satzung or Art. 81 Satzung may vary these figures. Source: BayBO, Fassung 14.08.2007, valid from 01.05.2026, GVBl. S. 588, BayRS 2132-1-B. | BayBO Art. 6 (consolidated, valid 01.05.2026) | `gesetze-bayern.de/Content/Document/BayBO-6` | `verified` — full text extracted via live probe 2026-07-23 |
| **HBauO §6 and BauO Bln §6 access** | Hamburg (landesrecht-hamburg.de) and Berlin (gesetze.berlin.de) LBO portals are JavaScript SPA applications — content not accessible via curl. Text requires a headless browser or PDF/print alternative. | Live probe 2026-07-23 — both portals returned 5,634 chars of JS bundle only | `landesrecht-hamburg.de` / `gesetze.berlin.de` | `verified (negative)` — curl insufficient; headless browser or alternative needed |
| Berlin Baunutzungsplan | 1958/60 preparatory land-use plan for pre-1990 West Berlin; binding per §173(3) BBauG; uses "Baustufen" grading (not BauNVO letters) | — | Baunutzungsplan 1958/60; §173(3) Bundesbaugesetz (BBauG) | Berlin FIS-Broker (digitised legacy layer) | `fbinter.stadt-berlin.de` | `published` |
| Berlin Baunutzungsplan voidance risk | Figures can be judicially struck down as *funktionslos*; OVG Berlin-Brandenburg 2020 voided GFZ 1.5 in Neukölln as no longer realizable | — | OVG Berlin-Brandenburg, 15 Sep 2020 (Az. 2 B 10.17) | Court ruling | — | `published` — treat any Baunutzungsplan-derived figure as `corroborated, subject to functional-voidance risk`, NOT `published` |
| Signature gate (all cities) | Printed, signed official B-Plan (Satzung) is legally binding; XPlanGML/INSPIRE is informational only | — | German constitutional principle (Rechtsstaat / Urkundlichkeit) | National legal principle | — | `published` |
| Denkmalschutz fragmentation | Heritage protection is Land law; no federal register; Landesdenkmalamt per Land; not assumed to be a queryable GIS layer | — | Each Land's Denkmalschutzgesetz | 16 separate Denkmalschutzgesetze | Per-Land heritage authority portals | `published` (fact of fragmentation) |
| **VG250 — admin routing (AGS)** | Verwaltungsgebiete 1:250 000; carries AGS to Gemeinde level; download + WFS; EPSG 25832/4326 | — | BKG (Bundesamt für Kartographie und Geodäsie) | "Verwaltungsgebiete VG250", BKG, current | `gdz.bkg.bund.de` | `corroborated` — CONVERGENT-SECONDARY, licence DL-DE BY 2.0; not live-probed |
| **DGM — terrain (LiDAR)** | DGM1/2/5/10 digital terrain models; per-Land WCS/GeoTIFF; datum DHHN2016 (NHN) | m | Per-Land Vermessungsverwaltung (AdV/ATKIS) | Per-Land DGM product pages | Per-Land geoportals; discovery via `govdata.de` | `corroborated` — CONVERGENT-SECONDARY; per-Land licence (DL-DE Zero/BY); not live-probed |
| **DOP — orthophotos** | DOP20 (20 cm) / DOP10 (10 cm); per-Land WMTS/WMS/download; often annual | m/px | Per-Land Vermessungsverwaltung (ATKIS) | Per-Land DOP product pages | Per-Land geoportals | `corroborated` — CONVERGENT-SECONDARY; per-Land licence; not live-probed |
| **ATKIS Basis-DLM — topographic context** | Roads/water/land-use object model; per-Land WFS/download; one AdV object catalogue | — | Per-Land (AdV ATKIS standard) | "ATKIS Basis-DLM Objektartenkatalog", AdV, current | `adv-online.de`; per-Land geoportals | `corroborated` — CONVERGENT-SECONDARY; OSM = national fallback; not live-probed |
| **BfN — Natura2000 + landscape** | Protected-area + landscape geodata; WFS/WMS | — | BfN (Bundesamt für Naturschutz) | BfN Geodienste | `geodienste.bfn.de` | `corroborated` — CONVERGENT-SECONDARY; not live-probed |
| **BGR — soil / geology** | National soil + geology geodata; WMS/download | — | BGR (Bundesanstalt für Geowissenschaften und Rohstoffe) | BGR GeoViewer | `geoviewer.bgr.de` | `corroborated` — CONVERGENT-SECONDARY; not live-probed |
| **UBA / LAWA — flood + water** | EU Flood Directive + water-body geodata (INSPIRE); federal frame, per-Land delivery; some PDF-only | — | UBA (Umweltbundesamt) / LAWA + Länder | EU Flood Directive INSPIRE services | `umweltbundesamt.de`; per-Land water authorities | `corroborated` — CONVERGENT-SECONDARY; mixed WMS/WFS/PDF; not live-probed |

> **Federation atlas cross-reference:** the national architecture, the Priority-1..4 dataset
> inventory, and the 16-Land endpoint matrix built from these rows live in
> `../GERMANY.md`, `../GERMANY-GEOSPATIAL-DATA-INVENTORY.md`, and `../LAND-REGISTRY.md`.
> All rows above are CONVERGENT-SECONDARY (multi-source, unprobed) except NRW LoD2, which is
> VERIFIED-LIVE (see `../LOD-RATE.md` probe appendix).

---

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it (the exact source to read) |
|---|---|---|
| Hamburg XPlanung WFS field names (GRZ, GFZ, Höhe attribute names in XPlanGML response) | No live GetFeature probe run | Run the probe in `NEXT.md §8`; inspect JSON/GML for GRZ/GFZ/hoeheMN fields |
| GRZ/GFZ/Höhe null-rate in Hamburg XPlanGML | Unknown — a compliant XPlanGML file may carry only geometry and a PDF link | From the probe result: what % of returned B-Plan features have non-null GRZ, GFZ, and height attributes? |
| ALKIS WFS access terms — Hamburg | Hamburg LGV geoportal not checked for authentication requirement | `curl "https://geodienste.hamburg.de/HH_WFS_ALKIS?SERVICE=WFS&REQUEST=GetCapabilities"` — check for HTTP 401 or auth headers |
| ALKIS WFS access terms — Bavaria | Bayerische Vermessungsverwaltung licence not read | Check `geodaten.bayern.de` licence terms for parcel WFS |
| ALKIS WFS access terms — Berlin | GDI-BE partly open; specific ALKIS parcel endpoint and terms not confirmed | Check `gdi.berlin.de` for ALKIS parcel WFS endpoint |
| Bavarian LoD2 licence terms (open or restricted?) | ZSHH is hosted in Bavaria, but this ≠ confirmed open terms for Bavaria-local access | Check `geodaten.bayern.de` for LoD2 product page and licence text |
| §34 coverage fraction — Munich | Assumed smaller than Berlin but not measured | Grid-sample probe over Munich bbox classifying B-Plan vs §34 coverage (see `NEXT.md §3.4`) |
| §34 coverage fraction — Hamburg | Assumed negligible (full XPlanung migration) but not measured | Same grid-sample probe over Hamburg bbox |
| Berlin Baunutzungsplan: Baustufen → modern GRZ/GFZ translation table | Does not exist in XPlanGML; needs historical plan legend/key from 1958/60 documentation | Berlin Senate archive, Stadtentwicklungsamt — original Baunutzungsplan legend/key |
| Any numeric B-Plan rule value (GRZ, GFZ, Höhe) for any specific parcel in any German city | No B-Plan has been read | Run probe in `NEXT.md §8`; then read specific B-Plan Satzung or XPlanGML attribute for target parcel |

---

⚠ No numeric GRZ, GFZ, or Höhe value has been verified from a primary source for any German parcel. The §17 BauNVO ceiling table in `README.md §1.3` is verified as the national ceiling — do not use it as a default value for any specific parcel.
