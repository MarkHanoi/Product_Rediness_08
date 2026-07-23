# Italy (`it`) — national data sources

**Status:** RESEARCH COMPLETE — not live-probed. No numeric rule value has been verified by direct
endpoint query. All entries below are research-level citations; each requires a live probe before
any downstream pack may ship a value.

---

## A — VERIFIED (research-level citations; live probe required before pack use)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| **Catasto WFS — parcel geometry** | `wfs.cartografia.agenziaentrate.gov.it` — WFS service, CC BY 4.0, covers entire national territory except AP Trento and Bolzano. Feature type: `cp:CadastralParcel` (INSPIRE schema). 300,000+ sheets, >85 million parcels. | Catasto (Agenzia delle Entrate) | `https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/ows01_CXF.php` | `corroborated` — endpoint existence confirmed in research; GetFeature schema not live-probed |
| **Catasto WMS** | `wms.cartografia.agenziaentrate.gov.it` — WMS companion service, same licence | Catasto (Agenzia delle Entrate) | `https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01_CXF.php` | `corroborated` — research-level only |
| **Catasto bulk download (Feb 2025)** | Open-data bulk download of parcels and addresses nationwide — released February 2025 | Agenzia delle Entrate open data | `https://www.agenziaentrate.gov.it/portale/web/guest/schede/catasto/cartografia-catastale/consultazione-cartografia-catastale` | `corroborated` — existence and date confirmed; format and download path TBD |
| **DM 1444/1968 — zone taxonomy** | Zone territoriali omogenee A–F (Art. 2); density ceilings (Art. 7–8): zone B ceiling 5 mc/mq fondiario; zone E ceiling 0.03 mc/mq fondiario; Art. 9: 10 m minimum between buildings with facing windows | DM 2 aprile 1968 n. 1444 (GU 16 aprile 1968 n. 97) | `https://www.normattiva.it/uri-res/N2Ls?urn:nir:ministro.lavori.pubblici:decreto:1968-04-02;1444` | `published` |
| **Codice Civile Art. 873 — boundary setback** | 3 m minimum from boundary in absence of stricter local rule | Codice Civile, R.D. 16 marzo 1942 n. 262, Art. 873 | `https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1942-03-16;262` | `published` |
| **DPR 380/2001 Art. 2-bis — regional derogation** | Regions may establish their own derogation criteria for the DM 1444 Art. 9 building-distance rule (e.g. in the case of urban-requalification or building-recovery plans with agreed layouts) | DPR 6 giugno 2001 n. 380 (Testo Unico Edilizia), Art. 2-bis | `https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.del.presidente.della.repubblica:2001-06-06;380` | `published` |
| **D.Lgs. 42/2004 — Codice Beni Culturali** | Basis for landscape and cultural-heritage constraints; SITAP covers Artt. 136/157/142(1)(m); Vincoli in Rete covers Parts II and III | D.Lgs. 22 gennaio 2004 n. 42 | `https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2004-01-22;42` | `published` |
| **SITAP — landscape constraints** | Georeferenced perimeters of landscape-interest declarations and legally-protected zones under Artt. 136/157 and 142(1)(m) of D.Lgs. 42/2004. Web-GIS run by MiC (Ministero della Cultura). Self-described as "purely informational and support character" — acknowledged incomplete; variable positional accuracy. | SITAP (Sistema Informativo Territoriale Ambientale e Paesaggistico), MiC | `https://sitap.beniculturali.it` | `corroborated` — exists; informational only; WFS endpoint TBD |
| **Vincoli in Rete — cultural heritage** | Cultural-heritage protections under D.Lgs. 42/2004 Parts II and III (individually listed buildings and archaeological assets). Freely consultable. | Vincoli in Rete, MiC | `https://vincoliinrete.beniculturali.it` | `corroborated` — exists; programmatic queryability TBD |
| **PST/SIM terrain (DTM/DSM)** | Piano Straordinario di Telerilevamento + PNRR SIM expansion. CC BY 4.0. PNRR target: 100% national coverage by 2026 (25 cm resolution, ~8 cm vertical accuracy). Terrain/surface model only — NOT a building model. | MASE (Ministero dell'Ambiente) open data | `https://www.mase.gov.it` | `published` — PST/SIM existence and PNRR mandate confirmed |
| **ARPA Piemonte Edifici 3D** | Per-building volumetric footprints with mean elevation for Piedmont region. Derived from BDTRE regional topographic database + terrain height from PST/MASE or regional altimetric sources. Includes per-building data-quality/derivation code. | ARPA Piemonte | `https://www.arpa.piemonte.it` / `https://opendata.arpa.piemonte.it` | `corroborated` — existence and method confirmed in research; endpoint and field schema TBD |
| **L.R. Lombardia 12/2005** | Introduced PGT (Piano di Governo del Territorio) as Lombardy's exclusive planning instrument, replacing the PRG | Regione Lombardia, L.R. 11 marzo 2005 n. 12 | `https://normelombardia.consiglio.regione.lombardia.it` | `published` |

---

| **EU INSPIRE Geoportal** | Free federated search across all Italian planning regimes; returns per-municipality dataset records by comune name + plan type. Confirmed hits: Lecce, Bari, Lavagna, Aosta, Valle d'Aosta. **⚠ Discovery only** — each record requires individual format/currency verification; many hits are georeferenced historical scans (raster, `Grid` spatial representation type), not current vector layers. | EU INSPIRE | `https://inspire-geoportal.ec.europa.eu` | `corroborated — discovery layer; not a data-quality signal` |
| **dati.gov.it + RNDT (national discovery catalog)** | Free public discovery for finding PDF/document links per comune; regional RNDT metadata flows to EU INSPIRE Geoportal. Useful for enumerating which comuni have published any plan data before manual search. Improves *findability*, not *data structure*. | Presidenza del Consiglio / AgID | `https://dati.gov.it` · `https://geodati.gov.it/geoportale/` (RNDT) | `corroborated — discovery only` |
| **OpenBuildingMap — national modeled building height** | Free global dataset (published 2025) with per-building height estimated from EU JRC Global Human Settlement built-up-characteristics layer; covers Italy. **⚠ Modeled/estimated — NOT authoritative or survey-grade.** Satellite-derived; materially lower confidence than ARPA Piemonte's BDTRE-derived surveyed data. Must be explicitly flagged as modeled if used; never conflate with surveyed height. | OpenBuildingMap (JRC-derived) | `https://openbuildingmap.org` | `inferred — modeled; NOT shippable as a legal or surveyed claim` |
| **OSM Italy building footprints** | OpenStreetMap Italy extract (~2.1 GB, ODbL, continuously updated). Building completeness is uneven — confirmed ~1M OSM buildings vs. ~2.8M in Lombardy authoritative dataset (2018 study). Combine with OpenBuildingMap for height estimates. | OpenStreetMap / Geofabrik | `https://download.geofabrik.de/europe/italy.html` | `corroborated — geometry quality varies; completeness uneven` |
| **Lombardy Indagine Offerta PGT** | Region-wide free structured dataset with SLP (Superficie Lorda di Pavimento) floor-area figures by function (residential vs. other) for every Lombard comune. Collected under L.R. 31/2014, in partnership with ANCI Lombardia and ARIA S.p.A. Covers: Transformation Areas (Documento di Piano) and Implementation Plans (Piano delle Regole). **Not per-parcel FAR** — aggregate by comune/transformation area. Best FAR-adjacent structured data found in Italy. Schema not yet probed. | Regione Lombardia / ARIA S.p.A. | Geoportale Regione Lombardia or ARIA open data portal | `corroborated — existence confirmed; schema TBD` |
| **APAR/SITAP WFS** | SITAP re-engineered as APAR/SITAP, now OGC-compliant (WMS + WFS), delivering genuine vector cartography (polygon, line, point) for landscape constraints (D.Lgs. 42/2004 Artt. 136/157/142). Guida v2.0.0 confirms OGC alignment behind `sitap.cultura.gov.it`. **Access model (public vs. MiBACT-restricted) not yet confirmed by live probe.** Content confidence ceiling unchanged (informational, not certifying). | MiBACT / APAR | `https://sitap.cultura.gov.it` | `corroborated — WFS access method confirmed; public access and schema TBD` |
| **AP Bolzano / South Tyrol geodata** | CC0 geodata via WMS/WMTS/WFS/WCS from provincial administration and municipalities; open-data programme since 2007. NewPlan: unified planning + landscape-constraint GIS. Parcel-level zoning queryability and planning-layer licence not yet live-probed. | Autonomous Province of Bolzano | `https://geokatalog.buergernetz.bz.it/` · `https://geoservices.buergernetz.bz.it/` | `corroborated — infrastructure existence confirmed; planning layer WFS and access TBD` |
| **UrbisMap API** | Documented urban-planning API service with technical architecture and endpoints (not just web-GIS). Separate territorial-data-integration API for PA software. Licensed (not free), but provides an actual API contract rather than scraping. | UrbisMap (commercial) | `https://www.urbismap.it` | `secondary — commercial; API existence confirmed` |
| **Arcai** | AI chat layer indexing NTA/PRG/PGT/PUC documents article-by-article for 6,252 comuni (~€39/month). Acknowledged failure mode on documents with corrupted characters/OCR artifacts. PDF-transcription-as-a-service, not raw structured data. | Arcai (commercial) | `https://www.arcai.it` | `secondary — commercial; coverage and reliability caveats apply` |

---

## B — UNVERIFIED (needed before any numeric rule may ship)

| Field | Why not verified | What would verify it (the exact source to read) |
|---|---|---|
| **Catasto WFS field schema** | Not live-probed — feature type name, GetFeature response fields, and whether authentication is required are unconfirmed | Direct GetCapabilities + GetFeature against `wfs.cartografia.agenziaentrate.gov.it` |
| **Any operative zoning parameter for any Italian parcel** | No national zoning WFS; regional geoportals not live-probed | Per-city: Piedmont PRG mosaic WFS (Turin) or Lombardy Geoportale PGT WFS (Milan) |
| **APAR/SITAP WFS public access** | WFS confirmed in APAR documentation (guida v2.0.0); whether endpoint is publicly accessible or MiBACT-restricted is unconfirmed | Direct probe of `sitap.cultura.gov.it` OGC endpoints — see NEXT.md B5 |
| **AP Bolzano NewPlan WFS and planning-layer access** | Infrastructure existence confirmed; parcel-level zoning queryability, licence for planning layer, and whether WFS is public or institution-restricted are unconfirmed | Direct probe of `geoservices.buergernetz.bz.it` — see NEXT.md B0 |
| **Lombardy Indagine Offerta PGT schema** | Existence and purpose confirmed; field names, granularity (per comune vs. per transformation area), and currency unknown | Direct download from Geoportale Lombardia or ARIA open data — see NEXT.md B8 |
| **ARPA Piemonte Edifici 3D endpoint and field schema** | Existence confirmed; WFS/download path and field names not read | `opendata.arpa.piemonte.it` → search "Edifici 3D" |
| **Catasto bulk download format (Feb 2025)** | Release confirmed; format (GeoJSON / GeoPackage / Shapefile) and schema not read | Download the manifest from Agenzia delle Entrate open data portal |
| **Regional derogation status (Art. 9) for Lombardy, Lazio, Piedmont** | DPR 380/2001 Art. 2-bis regime confirmed nationally; which regions have enacted active derogations is unresearched | Each region's own planning law or regional building code (for Lombardy: LR 12/2005 and RET; for Lazio: LR 38/1999; for Piedmont: LR 56/1977 as amended) |
| **Palermo zoning shapefile currency** | CC BY 4.0 shapefile confirmed; dated to 2004 council resolution (presa d'atto N.07/2004); subsequent varianti currency unknown | Check Comune di Palermo urban planning portal for varianti adopted post-2004 |
| **Turin DCC 123 (2026) PRG revision structure** | PRG revision in progress; preliminary text not read; incoming zone-classification mechanism unknown | Read DCC 123 preliminary revision text from `comune.torino.it` |

---

⚠ **SITAP/APAR-derived values must never be shipped as `certified` or `published`.** Despite the
OGC access-method upgrade, SITAP explicitly self-describes as informational and acknowledged
incomplete. Every APAR/SITAP-derived constraint row must carry: *"SITAP (informational only —
acknowledged incomplete and of variable positional accuracy; a null result does not certify absence
of a constraint; structured access ≠ certified content)."* Confidence ceiling: `corroborated`.

⚠ **OpenBuildingMap / OSM height values must never be presented at the same confidence tier as
ARPA Piemonte Edifici 3D.** The modeled/crowd-sourced category is categorically different from
surveyed. Label explicitly: "modeled estimate — not authoritative."
